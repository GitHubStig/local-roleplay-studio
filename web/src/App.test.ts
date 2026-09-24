import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from './api'
import App from './App.vue'
import { clearCurrentSession } from './composables/useCurrentSession'
import PlayView from './views/PlayView.vue'
import SessionView from './views/SessionView.vue'
import SettingsView from './views/SettingsView.vue'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getHealth: vi.fn(async () => ({ ok: true })),
  getSession: vi.fn(),
  getSettings: vi.fn(),
  getSettingsOptions: vi.fn(),
  getScenarios: vi.fn(async () => ({ scenarios: [], errors: [] })),
}))

const session: api.Session = {
  id: 's1',
  scenarioId: 'photoshoot',
  settings: {} as api.Settings,
  seed: 1,
  status: 'active',
  createdAt: '2026-09-24T00:00:00.000Z',
  turns: [{
    index: 0,
    action: null,
    scene: {},
    narration: 'Maya arrives.',
    declined: false,
    imagePrompt: 'p',
    image: 'turn-0.png',
    createdAt: '2026-09-24T00:00:00.000Z',
  }],
}

async function mountApp(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'play', component: PlayView },
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
  vi.mocked(api.getSettings).mockResolvedValue({
    textModel: 'llama3:latest',
    imageModel: 'flux2-klein-4b',
    steps: 4,
    size: 'portrait',
    quantize: null,
    seedMode: 'random',
    seed: 1,
  })
  vi.mocked(api.getSettingsOptions).mockResolvedValue({
    textModels: ['llama3:latest'],
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
    expect(api.getSession).toHaveBeenCalledTimes(1)
  })

  it('forgets a Session that no longer exists and goes to Start Session', async () => {
    vi.mocked(api.getSession).mockRejectedValue(new api.ApiError('Session not found', 404))
    const { wrapper, router } = await mountApp('/sessions/s1')
    expect(router.currentRoute.value.path).toBe('/')
    expect(playLink(wrapper).attributes('href')).toBe('/')
  })

  it('forgets an ended Session', async () => {
    vi.mocked(api.getSession).mockResolvedValue({ ...structuredClone(session), status: 'ended' })
    const { wrapper, router } = await mountApp('/sessions/s1')
    await router.push('/settings')
    await flushPromises()
    expect(playLink(wrapper).attributes('href')).toBe('/')
  })
})
