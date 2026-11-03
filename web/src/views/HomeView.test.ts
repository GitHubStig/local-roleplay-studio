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
  getScenarios: vi.fn(() => Promise.resolve({ scenarios: [], errors: [] })),
  getSettings: vi.fn(() => Promise.resolve({ textModel: 'x' })),
  getSettingsOptions: vi.fn(() =>
    Promise.resolve({ textModels: ['x'], imageModels: [], sizePresets: [] })
  ),
}))

const summary = (id: string, extra: Partial<api.SessionSummary> = {}): api.SessionSummary => ({
  id,
  kind: 'chain',
  scenarioId: 'tavern',
  title: 'The Rain-Soaked Tavern',
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
    routes: [
      { path: '/', component: HomeView },
      { path: '/sessions/:id', component: {} },
      { path: '/storyboards/:id', component: {} },
      { path: '/scenario/:id?', name: 'scenario', component: {} },
    ],
  })
  await router.push('/')
  const wrapper = mount(HomeView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
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
    expect(cards[0].find('[data-kind]').text()).toBe('Chain')
  })

  it('keeps Start a new Session closed under its button while there are Sessions', async () => {
    const { wrapper } = await mountIt()
    const button = wrapper.find('[data-new-session]')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-brief]').exists()).toBe(false)
    await button.trigger('click')
    await flushPromises()
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('[data-brief]').exists()).toBe(true)
    // Above Your Sessions, so it pushes them down.
    const html = wrapper.html()
    expect(html.indexOf('data-brief')).toBeLessThan(html.indexOf('Your Sessions'))
  })

  it('remembers Start a new Session opened or closed, for this tab', async () => {
    const first = (await mountIt()).wrapper
    await first.find('[data-new-session]').trigger('click')
    first.unmount()
    const again = (await mountIt()).wrapper
    expect(again.find('[data-new-session]').attributes('aria-expanded')).toBe('true')
    expect(localStorage.getItem('home.new-session-open')).toBeNull()
  })

  it('opens Start a new Session when there are no Sessions yet', async () => {
    vi.mocked(api.listSessions).mockResolvedValue([])
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-brief]').exists()).toBe(true)
  })

  it("shows a Roleplay's latest line in place of an image", async () => {
    vi.mocked(api.listSessions).mockResolvedValue([
      summary('r', { kind: 'roleplay', latestImage: null, excerpt: 'Sit down.' }),
    ])
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-session] a').attributes('href')).toBe('/roleplay/r')
    expect(wrapper.find('[data-excerpt]').text()).toBe('“Sit down.”')
  })

  it("shows a Storyboard's Beat in place of an image, without a line's quotation marks", async () => {
    vi.mocked(api.listSessions).mockResolvedValue([
      summary('s', { kind: 'storyboard', latestImage: null, excerpt: 'Kael reads the letter.' }),
    ])
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-excerpt]').text()).toBe('Kael reads the letter.')
  })

  it('links a Storyboard to its own screen', async () => {
    vi.mocked(api.listSessions).mockResolvedValue([summary('s', { kind: 'storyboard' })])
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-session] a').attributes('href')).toBe('/storyboards/s')
    expect(wrapper.find('[data-kind]').text()).toBe('Storyboard')
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
    expect(wrapper.find('[data-activity]').text()).toBe('Waiting for another render…')
    expect(wrapper.find('[data-delete]').attributes('disabled')).toBeDefined()
  })

  it('shows an Opening failure that arrives while already on Home', async () => {
    const { wrapper, router } = await mountIt()
    await router.replace({ path: '/', query: { error: 'Ollama: model not found' } })
    await flushPromises()
    expect(wrapper.find('[data-new-session]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.text()).toContain("Couldn't start the Session: Ollama: model not found")
  })

  it('drops the failure from the address once shown, so a refresh clears it', async () => {
    const { wrapper, router } = await mountIt()
    await router.replace({ path: '/', query: { error: 'Ollama: model not found' } })
    await flushPromises()
    expect(router.currentRoute.value.query.error).toBeUndefined()
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

  it('opens the Scenario page on a Scenario picked', async () => {
    vi.mocked(api.getScenarios).mockResolvedValue({
      scenarios: [{ id: 'tavern', title: 'The Rain-Soaked Tavern', description: '', own: false }],
      errors: [],
    })
    const { wrapper, router } = await mountIt()
    await wrapper.find('[data-new-session]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-scenario=tavern]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/scenario/tavern')
  })
})
