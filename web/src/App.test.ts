import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from './api'
import { ALL_AVAILABLE, ALL_ON, promptFor } from './testing'
import App from './App.vue'
import { clearCurrentSession } from './composables/useCurrentSession'
import HomeView from './views/HomeView.vue'
import SessionView from './views/SessionView.vue'
import SettingsView from './views/SettingsView.vue'
import StoryboardView from './views/StoryboardView.vue'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getHealth: vi.fn(async () => ({ ok: true })),
  getSession: vi.fn(),
  getSettings: vi.fn(),
  getSettingsOptions: vi.fn(),
  getScenarios: vi.fn(async () => ({ scenarios: [], errors: [] })),
  listSessions: vi.fn(async () => []),
  streamFrame: vi.fn(),
  cancelFrame: vi.fn(),
}))

const session: api.Session = {
  id: 's1',
  kind: 'chain',
  brief: null,
  scenarioId: 'tavern',
  settings: {} as api.Settings,
  seed: 1,
  createdAt: '2026-09-24T00:00:00.000Z',
  frames: [{
    index: 0,
    action: null,
    prompt: promptFor(0),
    narration: 'Kael looks up.',
    outcome: 'done',
    promptText: 'p',
    image: 'frame-0.png',
    createdAt: '2026-09-24T00:00:00.000Z',
  }],
}

async function mountApp(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: HomeView },
      { path: '/sessions/:id', name: 'session', component: SessionView, props: true },
      { path: '/storyboards/:id', name: 'storyboard', component: StoryboardView, props: true },
      { path: '/settings', name: 'settings', component: SettingsView },
    ],
  })
  await router.push(path)
  const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

const currentLink = (w: Awaited<ReturnType<typeof mountApp>>['wrapper']) =>
  w.find('[data-current-session]')

beforeEach(() => {
  localStorage.clear()
  clearCurrentSession('s1')
  vi.mocked(api.getSession).mockReset().mockResolvedValue(structuredClone(session))
  vi.mocked(api.streamFrame).mockReset()
  vi.mocked(api.cancelFrame).mockReset()
  vi.mocked(api.getSettings).mockResolvedValue({
    textBackend: 'ollama',
    textBaseUrl: '',
    textModel: 'llama3:latest',
    thinking: false,
    imageModel: 'flux2-klein-4b',
    steps: 4,
    size: 'portrait',
    quantize: null,
    stepCache: 0.4,
    fast: false,
    seedMode: 'random',
    seed: 1,
    upscaler: 'seedvr2-7b',
    limits: true,
    artModel: '',
    artStyle: 'prose',
    features: ALL_ON,
  })
  vi.mocked(api.getSettingsOptions).mockResolvedValue({
    textModels: ['llama3:latest'],
    thinkingModels: [],
    imageModels: [],
    sizePresets: [],
    upscalers: [],
    features: ALL_AVAILABLE,
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('App navigation', () => {
  it('shows no Current Session link when no Session is in progress', async () => {
    const { wrapper } = await mountApp('/settings')
    expect(currentLink(wrapper).exists()).toBe(false)
  })

  it('returns to the Session in progress from Settings, keeping the typed Direction', async () => {
    const { wrapper, router } = await mountApp('/sessions/s1')
    await wrapper.find('textarea').setValue('Sit on the stool')

    await router.push('/settings')
    await flushPromises()
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(currentLink(wrapper).attributes('href')).toBe('/sessions/s1')

    await currentLink(wrapper).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/sessions/s1')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe(
      'Sit on the stool',
    )
    // Loaded once, then re-checked on return; the screen itself was kept, not rebuilt.
    expect(api.getSession).toHaveBeenCalledTimes(2)
  })

  it('returns to a Storyboard in progress from Settings', async () => {
    vi.mocked(api.getSession).mockResolvedValue({
      id: 'sb',
      kind: 'storyboard',
      brief: 'A first dunk.',
      scenarioId: null,
      settings: {} as api.Settings,
      seed: 1,
      createdAt: '2026-09-25T00:00:00.000Z',
      frameCount: 1,
      look: { subject: 'A student.', style: 'Manga.' },
      frames: [{
        index: 0,
        beat: 'The dunk.',
        body: 'Body.',
        prompt: promptFor(0),
        promptText: 'p',
        image: null,
        createdAt: '2026-09-25T00:00:00.000Z',
      }],
    })
    const { wrapper, router } = await mountApp('/storyboards/sb')
    await router.push('/settings')
    await flushPromises()
    expect(currentLink(wrapper).attributes('href')).toBe('/storyboards/sb')
  })

  it('the app name leads Home', async () => {
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
    expect(currentLink(wrapper).attributes('href')).toBe('/sessions/s2')

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

  it("won't leave a Session while its Frame waits for another render", async () => {
    let emit!: (e: api.FrameEvent) => void
    vi.mocked(api.streamFrame).mockImplementation((_id, _action, onEvent) => {
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
    expect(wrapper.find('[role=alert]').text()).toContain('Cancel this Frame to leave')

    emit({ type: 'phase', phase: 'image' })
    await flushPromises()
    await router.push('/settings')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/settings')
  })

  it('writes the Opening Frame exactly once for a new Session', async () => {
    vi.mocked(api.getSession).mockResolvedValue({ ...structuredClone(session), frames: [] })
    vi.mocked(api.streamFrame).mockImplementation(() => new Promise(() => {}))
    await mountApp('/sessions/s1')
    expect(api.streamFrame).toHaveBeenCalledTimes(1)
  })

  it("doesn't pull the player Home when a background Session's Opening fails", async () => {
    vi.mocked(api.getSession).mockResolvedValue({ ...structuredClone(session), frames: [] })
    let emit!: (e: api.FrameEvent) => void
    vi.mocked(api.streamFrame).mockImplementation((_id, _action, onEvent) => {
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

  it('follows a Frame it did not start, with Cancel, until it finishes', async () => {
    vi.useFakeTimers()
    try {
      const running = { ...structuredClone(session), activity: 'image' as const }
      const done = {
        ...structuredClone(session),
        activity: null,
        frames: [...session.frames, { ...session.frames[0], index: 1, action: 'Sit' }],
      }
      vi.mocked(api.getSession).mockResolvedValueOnce(running).mockResolvedValueOnce(running)
        .mockResolvedValue(done)
      const { wrapper } = await mountApp('/sessions/s1')
      expect(wrapper.find('[role=status]').text()).toContain('Rendering the image')
      expect(wrapper.find('textarea').attributes('disabled')).toBeDefined()
      await wrapper.findAll('button').find((b) => b.text() === 'Cancel')!.trigger('click')
      expect(api.cancelFrame).toHaveBeenCalledWith('s1')

      await vi.advanceTimersByTimeAsync(1500)
      expect(wrapper.find('[role=status]').exists()).toBe(true)
      await vi.advanceTimersByTimeAsync(1500)
      expect(wrapper.find('[role=status]').exists()).toBe(false)
      expect(wrapper.findAll('aside [data-frame]')).toHaveLength(2)
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
    expect(currentLink(wrapper).exists()).toBe(false)
  })
})
