import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '../api'
import { setCurrentSession, useCurrentSession } from '../composables/useCurrentSession'
import HomeView from './HomeView.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  listSessions: vi.fn(),
  deleteSession: vi.fn(),
  createSession: vi.fn(),
  getScenarios: vi.fn(async () => ({ scenarios: [], errors: [] })),
  getSettings: vi.fn(async () => ({ textModel: 'x' })),
  getSettingsOptions: vi.fn(async () => ({ textModels: ['x'], imageModels: [], sizePresets: [] })),
}))

const summary = (id: string, extra: Partial<api.SessionSummary> = {}): api.SessionSummary => ({
  id,
  kind: 'chain',
  scenarioId: 'photoshoot',
  title: 'Studio Photoshoot',
  frames: 3,
  latestImage: 'frame-2-abcdef12.png',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  activity: null,
  ...extra,
})

async function mountIt() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: HomeView }, { path: '/sessions/:id', component: {} }],
  })
  await router.push('/')
  const wrapper = mount(HomeView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(api.listSessions).mockReset().mockResolvedValue([summary('a'), summary('b')])
  vi.mocked(api.deleteSession).mockReset().mockResolvedValue()
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => vi.unstubAllGlobals())

describe('HomeView', () => {
  it('lists saved Sessions linking to each, with the latest image', async () => {
    const { wrapper } = await mountIt()
    const cards = wrapper.findAll('[data-session]')
    expect(cards).toHaveLength(2)
    expect(cards[0].find('a').attributes('href')).toBe('/sessions/a')
    expect(cards[0].find('img').attributes('src')).toBe(
      '/api/sessions/a/images/frame-2-abcdef12.png',
    )
    expect(cards[0].text()).toContain('3 Frames')
    expect(wrapper.text()).toContain('Start a new Session')
  })

  it('hides Your Sessions when there are none', async () => {
    vi.mocked(api.listSessions).mockResolvedValue([])
    const { wrapper } = await mountIt()
    expect(wrapper.text()).not.toContain('Your Sessions')
  })

  it('deletes a Session after confirming, forgetting it as current', async () => {
    setCurrentSession('a')
    localStorage.setItem('draft:a', 'half typed')
    const { wrapper } = await mountIt()
    vi.mocked(api.listSessions).mockResolvedValue([summary('b')])
    await wrapper.findAll('[data-delete]')[0].trigger('click')
    await flushPromises()
    expect(api.deleteSession).toHaveBeenCalledWith('a')
    expect(useCurrentSession().currentSessionId.value).toBeNull()
    expect(localStorage.getItem('draft:a')).toBeNull()
    expect(wrapper.findAll('[data-session]')).toHaveLength(1)
  })

  it('does nothing if the delete is not confirmed', async () => {
    vi.mocked(confirm).mockReturnValue(false)
    const { wrapper } = await mountIt()
    await wrapper.findAll('[data-delete]')[0].trigger('click')
    expect(api.deleteSession).not.toHaveBeenCalled()
  })

  it("shows what a busy Session is doing and won't delete it", async () => {
    vi.mocked(api.listSessions).mockResolvedValue([summary('a', { activity: 'queued' })])
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-activity]').text()).toBe('Waiting to render…')
    expect(wrapper.find('[data-delete]').attributes('disabled')).toBeDefined()
  })

  it('shows an Opening failure that arrives while already on Home', async () => {
    const { wrapper, router } = await mountIt()
    await router.replace({ path: '/', query: { error: 'Ollama: model not found' } })
    await flushPromises()
    expect(wrapper.text()).toContain("Couldn't start the Session: Ollama: model not found")
  })

  it('stops polling once Home is left, even mid-request', async () => {
    vi.useFakeTimers()
    try {
      let answer!: (list: api.SessionSummary[]) => void
      vi.mocked(api.listSessions).mockImplementation(() => new Promise((r) => (answer = r)))
      const { wrapper } = await mountIt()
      wrapper.unmount()
      answer([summary('a', { activity: 'image' })])
      await vi.advanceTimersByTimeAsync(10000)
      expect(api.listSessions).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('starts a new Session and opens it', async () => {
    vi.mocked(api.getScenarios).mockResolvedValue({
      scenarios: [{ id: 'photoshoot', title: 'Studio Photoshoot', description: '' }],
      errors: [],
    })
    vi.mocked(api.createSession).mockResolvedValue({ id: 'new' } as api.Session)
    const { wrapper, router } = await mountIt()
    await wrapper.findAll('button').find((b) => b.text() === 'Start Session')!.trigger('click')
    await flushPromises()
    expect(api.createSession).toHaveBeenCalledWith('photoshoot')
    expect(router.currentRoute.value.path).toBe('/sessions/new')
  })
})
