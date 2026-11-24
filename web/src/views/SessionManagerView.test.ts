import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '../api'
import SessionManagerView from './SessionManagerView.vue'

const phone = { matches: false }
vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vueuse/core')>()),
  useMediaQuery: () => ref(phone.matches),
}))
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  listSessions: vi.fn(),
  getSessionSizes: vi.fn(),
  getSessionsFolder: vi.fn(),
  getSessionContents: vi.fn(),
}))

const summary = (id: string, extra: Partial<api.SessionSummary> = {}): api.SessionSummary => ({
  id,
  kind: 'chain',
  scenarioId: null,
  title: id,
  frames: 2,
  thumbnail: null,
  excerpt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  activity: null,
  ...extra,
})

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  phone.matches = false
  vi.mocked(api.listSessions).mockResolvedValue([
    summary('Harbour fog', { updatedAt: '2026-11-20T00:00:00.000Z' }),
    summary('A lighthouse', { kind: 'storyboard', updatedAt: '2026-11-10T00:00:00.000Z' }),
    summary('Tavern', { kind: 'roleplay', updatedAt: '2026-11-05T00:00:00.000Z' }),
  ])
  vi.mocked(api.getSessionSizes).mockResolvedValue({
    'Harbour fog': 95_000_000,
    'A lighthouse': 640_000_000,
    Tavern: 2_200_000_000,
  })
  vi.mocked(api.getSessionsFolder).mockResolvedValue({
    inUse: '/app/sessions',
    default: '/app/sessions',
    count: 3,
    folders: [{ path: '/app/sessions', count: 3, default: true }],
    here: true,
    os: 'mac',
  })
  vi.mocked(api.getSessionContents).mockResolvedValue({
    size: 1,
    parts: { pictures: 1, clips: 0, '3d': 0, sound: 0, calls: 0 },
    rest: 0,
    counts: {
      frames: 2,
      pictures: 1,
      imageModels: 1,
      edits: 0,
      clips: 0,
      speech: 0,
      threeD: 0,
      cues: 0,
      calls: 0,
    },
  })
})

async function shown(path = '/sessions') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/sessions', component: SessionManagerView },
      { path: '/sessions/:id', component: {} },
      { path: '/storyboards/:id', component: {} },
      { path: '/roleplay/:id', component: {} },
    ],
  })
  await router.push(path)
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

const rows = (wrapper: Awaited<ReturnType<typeof shown>>['wrapper']) =>
  wrapper.findAll('[data-session-row]').map((r) => r.find('.font-medium').text())

describe('SessionManagerView', () => {
  it('lists the Sessions biggest first, each with its size, and the folder in all', async () => {
    const { wrapper } = await shown()
    expect(rows(wrapper)).toEqual(['Tavern', 'A lighthouse', 'Harbour fog'])
    expect(wrapper.findAll('[data-session-row] [data-session-size]').map((s) => s.text()))
      .toEqual(['2.2 GB', '640 MB', '95 MB'])
    expect(wrapper.find('[data-folder-total]').text()).toBe('2.9 GB in this folder')
  })

  it('sorts by last changed, kind or title, and remembers it', async () => {
    const { wrapper } = await shown()
    const sort = wrapper.find('[data-sort]')
    await sort.setValue('changed')
    expect(rows(wrapper)).toEqual(['Harbour fog', 'A lighthouse', 'Tavern'])
    await sort.setValue('kind')
    expect(rows(wrapper)).toEqual(['Harbour fog', 'Tavern', 'A lighthouse'])
    await sort.setValue('title')
    expect(rows(wrapper)).toEqual(['A lighthouse', 'Harbour fog', 'Tavern'])
    expect(rows((await shown()).wrapper)).toEqual(['A lighthouse', 'Harbour fog', 'Tavern'])
  })

  it('shows the Session asked for beside the list, or else the first', async () => {
    const first = await shown()
    expect(first.wrapper.find('[data-session-pane] [data-session-title]').text()).toBe('Tavern')
    const asked = await shown('/sessions?id=Harbour%20fog')
    expect(asked.wrapper.find('[data-session-pane] [data-session-title]').text()).toBe(
      'Harbour fog',
    )
    await asked.wrapper.findAll('[data-session-row]')[1].trigger('click')
    await flushPromises()
    expect(asked.router.currentRoute.value.query.id).toBe('A lighthouse')
  })

  it('on a phone, the list is one screen and a Session another', async () => {
    phone.matches = true
    const { wrapper, router } = await shown()
    expect(wrapper.find('[data-session-pane]').exists()).toBe(false)
    await wrapper.findAll('[data-session-row]')[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.id).toBe('Tavern')
    expect(wrapper.find('[data-session-list]').exists()).toBe(false)
    expect(wrapper.find('[data-session-pane]').exists()).toBe(true)
    expect(wrapper.find('[data-back-to-list]').attributes('href')).toBe('/sessions')
  })
})
