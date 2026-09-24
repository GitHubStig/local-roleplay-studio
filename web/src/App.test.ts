import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from './api'
import { promptFor } from './testing'
import App from './App.vue'
import { clearCurrentSession } from './composables/useCurrentSession'
import HomeView from './views/HomeView.vue'
import SessionView from './views/SessionView.vue'
import SettingsView from './views/SettingsView.vue'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getHealth: vi.fn(async () => ({ ok: true })),
  getSession: vi.fn(),
  getSettings: vi.fn(),
  getSettingsOptions: vi.fn(),
  getScenarios: vi.fn(async () => ({ scenarios: [], errors: [] })),
  listSessions: vi.fn(async () => []),
  streamTurn: vi.fn(),
  cancelTurn: vi.fn(),
}))

const session: api.Session = {
  id: 's1',
  scenarioId: 'photoshoot',
  settings: {} as api.Settings,
  seed: 1,
  createdAt: '2026-09-24T00:00:00.000Z',
  turns: [{
    index: 0,
    action: null,
    prompt: promptFor(0),
    narration: 'Maya arrives.',
    outcome: 'done',
    promptText: 'p',
    image: 'turn-0.png',
    createdAt: '2026-09-24T00:00:00.000Z',
  }],
}

async function mountApp(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: HomeView },
      { path: '/sessions/:id', name: 'session', component: SessionView, props: true },
      { path: '/settings', name: 'settings', component: SettingsView },
    ],
  })
  await router.push(path)
  const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

const playLink = (w: Awaited<ReturnType<typeof mountApp>>['wrapper']) =>
  w.findAll('nav a').find((a) => a.text() === 'Play')!

beforeEach(() => {
  localStorage.clear()
  clearCurrentSession('s1')
  vi.mocked(api.getSession).mockReset().mockResolvedValue(structuredClone(session))
  vi.mocked(api.streamTurn).mockReset()
  vi.mocked(api.cancelTurn).mockReset()
  vi.mocked(api.getSettings).mockResolvedValue({
    textModel: 'llama3:latest',
    thinking: false,
    imageModel: 'flux2-klein-4b',
    steps: 4,
    size: 'portrait',
    quantize: null,
    seedMode: 'random',
    seed: 1,
  })
  vi.mocked(api.getSettingsOptions).mockResolvedValue({
    textModels: ['llama3:latest'],
    thinkingModels: [],
    imageModels: [],
    sizePresets: [],
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('App navigation', () => {
  it('Play leads to Start Session when no Session is in progress', async () => {
    const { wrapper } = await mountApp('/settings')
    expect(playLink(wrapper).attributes('href')).toBe('/')
  })

  it('returns to the Session in progress from Settings, keeping the typed Direction', async () => {
    const { wrapper, router } = await mountApp('/sessions/s1')
    await wrapper.find('textarea').setValue('Sit on the stool')

    await router.push('/settings')
    await flushPromises()
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(playLink(wrapper).attributes('href')).toBe('/sessions/s1')

    await playLink(wrapper).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/sessions/s1')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe(
      'Sit on the stool',
    )
    // Loaded once, then re-checked on return; the screen itself was kept, not rebuilt.
    expect(api.getSession).toHaveBeenCalledTimes(2)
  })

  it('RPG leads Home', async () => {
    const { wrapper } = await mountApp('/sessions/s1')
    expect(wrapper.find('h1 a').attributes('href')).toBe('/')
  })

  it('keeps each Session as it was when switching between two', async () => {
    vi.mocked(api.getSession).mockImplementation(async (id) => ({
      ...structuredClone(session),
      id,
    }))
    const { wrapper, router } = await mountApp('/sessions/s1')
    await wrapper.find('textarea').setValue('Direction for one')
    await router.push('/')
    await router.push('/sessions/s2')
    await flushPromises()
    await wrapper.find('textarea').setValue('Direction for two')
    expect(playLink(wrapper).attributes('href')).toBe('/sessions/s2')

    await router.push('/sessions/s1')
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe(
      'Direction for one',
    )
    await router.push('/sessions/s2')
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe(
      'Direction for two',
    )
  })

  it("won't leave a Session while its Turn waits for another render", async () => {
    let emit!: (e: api.TurnEvent) => void
    vi.mocked(api.streamTurn).mockImplementation((_id, _action, onEvent) => {
      emit = onEvent
      return new Promise(() => {})
    })
    const { wrapper, router } = await mountApp('/sessions/s1')
    await wrapper.find('textarea').setValue('Sit')
    await wrapper.findAll('button').find((b) => b.text() === 'Send')!.trigger('click')
    emit({ type: 'phase', phase: 'queued' })
    await flushPromises()

    await router.push('/settings').catch(() => {})
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/sessions/s1')
    expect(wrapper.find('[role=alert]').text()).toContain('Cancel this Turn to leave')

    emit({ type: 'phase', phase: 'image' })
    await flushPromises()
    await router.push('/settings')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/settings')
  })

  it('writes the Opening Turn exactly once for a new Session', async () => {
    vi.mocked(api.getSession).mockResolvedValue({ ...structuredClone(session), turns: [] })
    vi.mocked(api.streamTurn).mockImplementation(() => new Promise(() => {}))
    await mountApp('/sessions/s1')
    expect(api.streamTurn).toHaveBeenCalledTimes(1)
  })

  it("doesn't pull the player Home when a background Session's Opening fails", async () => {
    vi.mocked(api.getSession).mockResolvedValue({ ...structuredClone(session), turns: [] })
    let emit!: (e: api.TurnEvent) => void
    vi.mocked(api.streamTurn).mockImplementation((_id, _action, onEvent) => {
      emit = onEvent
      return new Promise(() => {})
    })
    const { router } = await mountApp('/sessions/s1')
    await router.push('/settings')
    await flushPromises()

    emit({ type: 'failed', message: 'Ollama: model not found', sessionDiscarded: true })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/settings')

    // Returning to it leads Home with the reason.
    await router.push('/sessions/s1')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.query.error).toBe('Ollama: model not found')
  })

  it('recovers a Session screen once the server answers again', async () => {
    vi.mocked(api.getSession).mockRejectedValueOnce(new Error('Failed to fetch'))
    const { wrapper, router } = await mountApp('/sessions/s1')
    expect(wrapper.text()).toContain('Could not load this Session')
    await router.push('/settings')
    await router.push('/sessions/s1')
    await flushPromises()
    expect(wrapper.text()).not.toContain('Could not load this Session')
    expect(wrapper.find('textarea').exists()).toBe(true)
  })

  it('follows a Turn it did not start, with Cancel, until it finishes', async () => {
    vi.useFakeTimers()
    try {
      const running = { ...structuredClone(session), activity: 'image' as const }
      const done = {
        ...structuredClone(session),
        activity: null,
        turns: [...session.turns, { ...session.turns[0], index: 1, action: 'Sit' }],
      }
      vi.mocked(api.getSession).mockResolvedValueOnce(running).mockResolvedValueOnce(running)
        .mockResolvedValue(done)
      const { wrapper } = await mountApp('/sessions/s1')
      expect(wrapper.find('[role=status]').text()).toContain('Rendering the image')
      expect(wrapper.find('textarea').attributes('disabled')).toBeDefined()
      await wrapper.findAll('button').find((b) => b.text() === 'Cancel')!.trigger('click')
      expect(api.cancelTurn).toHaveBeenCalledWith('s1')

      await vi.advanceTimersByTimeAsync(1500)
      expect(wrapper.find('[role=status]').exists()).toBe(true)
      await vi.advanceTimersByTimeAsync(1500)
      expect(wrapper.find('[role=status]').exists()).toBe(false)
      expect(wrapper.findAll('aside [data-turn]')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('re-checks the server status every 15 seconds', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(api.getHealth).mockClear()
      await mountApp('/settings')
      expect(api.getHealth).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(15000)
      expect(api.getHealth).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('forgets a Session that no longer exists and goes Home', async () => {
    vi.mocked(api.getSession).mockRejectedValue(new api.ApiError('Session not found', 404))
    const { wrapper, router } = await mountApp('/sessions/s1')
    expect(router.currentRoute.value.path).toBe('/')
    expect(playLink(wrapper).attributes('href')).toBe('/')
  })
})
