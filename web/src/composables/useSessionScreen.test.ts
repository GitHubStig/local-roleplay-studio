import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, KeepAlive, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '../api'
import { useSessionScreen } from './useSessionScreen'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSession: vi.fn(),
  cancelFrame: vi.fn(),
}))

interface Work {
  phase: api.Activity
  detached?: boolean
  cancelling?: boolean
}

const chain = (extra: Partial<api.ChainSession> = {}): api.ChainSession => ({
  id: 's1',
  kind: 'chain',
  brief: null,
  scenarioId: 'tavern',
  settings: { imageModel: 'qwen-image-2.1' } as api.Settings,
  seed: 1,
  createdAt: '2026-10-21T00:00:00.000Z',
  frames: [],
  ...extra,
})

/** A Chain screen with only what the composable does; `shown` switches it out and back in. */
async function mountScreen() {
  const work = ref<Work | null>(null)
  const begin = vi.fn()
  const onFollowed = vi.fn()
  const refreshJobs = vi.fn()
  let screen!: ReturnType<typeof useSessionScreen<'chain', Work>>
  const Screen = defineComponent({
    setup() {
      screen = useSessionScreen('s1', 'chain', {
        work,
        begin,
        following: (s, followed) => ({ ...followed, phase: s.activity!, detached: true }),
        onFollowed,
        refreshJobs,
      })
      return () => h('div')
    },
  })
  const shown = ref(true)
  const Parent = defineComponent({
    setup: () => () => h(KeepAlive, null, [shown.value ? h(Screen) : h('p')]),
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: {} }, { path: '/:kind/:id', component: {} }],
  })
  await router.push('/sessions/s1')
  mount(Parent, { global: { plugins: [router] } })
  await flushPromises()
  return { screen, work, begin, onFollowed, refreshJobs, router, shown }
}

enableAutoUnmount(afterEach)
beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useSessionScreen', () => {
  it('begins on first open when nothing is running, with the jobs loaded', async () => {
    vi.mocked(api.getSession).mockResolvedValue(chain())
    const { screen, begin, refreshJobs, router } = await mountScreen()
    expect(screen.session.value?.id).toBe('s1')
    expect(begin).toHaveBeenCalledOnce()
    expect(refreshJobs).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.path).toBe('/sessions/s1')
  })

  it("sends a Session of another kind to its own kind's screen", async () => {
    vi.mocked(api.getSession).mockResolvedValue({ ...chain(), kind: 'storyboard' } as never)
    const { screen, begin, router } = await mountScreen()
    expect(router.currentRoute.value.path).toBe('/storyboards/s1')
    expect([screen.session.value, begin.mock.calls.length]).toEqual([null, 0])
  })

  it('goes Home, forgetting the draft, when the Session is gone', async () => {
    localStorage.setItem('draft:s1', 'Open the door')
    vi.mocked(api.getSession).mockRejectedValue(new api.ApiError('Session not found', 404))
    const { router } = await mountScreen()
    expect(router.currentRoute.value.path).toBe('/')
    expect(localStorage.getItem('draft:s1')).toBeNull()
  })

  it('says why it could not load, and tries again when shown again', async () => {
    vi.mocked(api.getSession).mockRejectedValueOnce(new api.ApiError('Server down', 500))
    const { screen, begin, shown } = await mountScreen()
    expect(screen.loadError.value).toBe('Server down')
    vi.mocked(api.getSession).mockResolvedValue(chain())
    shown.value = false
    await flushPromises()
    shown.value = true
    await flushPromises()
    expect(screen.loadError.value).toBe('')
    expect(begin).toHaveBeenCalledOnce()
  })

  it('follows work running elsewhere until it ends, instead of beginning', async () => {
    vi.useFakeTimers()
    vi.mocked(api.getSession).mockResolvedValue(chain({ activity: 'text' }))
    const { work, begin, onFollowed } = await mountScreen()
    expect([work.value, begin.mock.calls.length]).toEqual([{ phase: 'text', detached: true }, 0])

    vi.mocked(api.getSession).mockResolvedValue(chain({ activity: 'image' }))
    await vi.advanceTimersByTimeAsync(1500)
    expect(work.value).toEqual({ phase: 'image', detached: true })

    vi.mocked(api.getSession).mockResolvedValue(chain({ activity: null }))
    await vi.advanceTimersByTimeAsync(1500)
    expect(work.value).toBeNull()
    expect(onFollowed).toHaveBeenCalledOnce()
  })

  it('catches up when shown again: follows work started meanwhile', async () => {
    vi.useFakeTimers()
    vi.mocked(api.getSession).mockResolvedValue(chain())
    const { work, refreshJobs, shown } = await mountScreen()
    shown.value = false
    await flushPromises()
    vi.mocked(api.getSession).mockResolvedValue(chain({ activity: 'image' }))
    shown.value = true
    await flushPromises()
    expect(work.value).toEqual({ phase: 'image', detached: true })
    expect(refreshJobs).toHaveBeenCalledTimes(2)
  })

  it('goes Home only once shown again, if the Session went away in the background', async () => {
    vi.mocked(api.getSession).mockResolvedValue(chain())
    const { screen, router, shown } = await mountScreen()
    shown.value = false
    await flushPromises()
    screen.leave({ error: 'It failed' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/sessions/s1')
    shown.value = true
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/?error=It+failed')
  })

  it('warns before a reload only while running work of its own', async () => {
    vi.mocked(api.getSession).mockResolvedValue(chain())
    const { work } = await mountScreen()
    const unload = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(unload()).toBe(false)
    work.value = { phase: 'text', detached: true }
    expect(unload()).toBe(false)
    work.value = { phase: 'text' }
    expect(unload()).toBe(true)
  })

  it('marks the work as cancelling, and asks the server to cancel it', async () => {
    vi.mocked(api.getSession).mockResolvedValue(chain())
    const { screen, work } = await mountScreen()
    work.value = { phase: 'image' }
    await screen.cancel()
    expect(work.value).toEqual({ phase: 'image', cancelling: true })
    expect(api.cancelFrame).toHaveBeenCalledWith('s1')
  })
})
