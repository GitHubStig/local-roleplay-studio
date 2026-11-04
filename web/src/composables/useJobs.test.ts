import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from '../api'

const listJobs = vi.fn()
const queueJob = vi.fn()
const retryJob = vi.fn()
vi.mock('../api', () => ({ listJobs, queueJob, retryJob }))

const upscale = (status: Job['status'], error?: string) =>
  ({ id: 'j1', kind: 'upscale', frameIndex: 0, status, createdAt: '', error }) as Job

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useJobs', () => {
  it('says why a job it was following failed, when asked to', async () => {
    const { useJobs } = await import('./useJobs')
    for (const reportFailures of [true, false]) {
      const onError = vi.fn()
      const jobs = useJobs('s1', { onSettled: () => {}, onError, reportFailures })
      queueJob.mockResolvedValueOnce([upscale('running')])
      listJobs.mockResolvedValueOnce([upscale('failed', "Couldn't reach ComfyUI")])
      await jobs.queue('upscale', 0)
      await vi.advanceTimersByTimeAsync(1000)
      await flushPromises()
      expect(onError.mock.calls).toEqual(
        reportFailures ? [["Upscale failed: Couldn't reach ComfyUI"]] : [],
      )
    }
  })

  it('says a failure is gone once its job is retried', async () => {
    const { useJobs } = await import('./useJobs')
    const onFailureGone = vi.fn()
    const jobs = useJobs('s1', {
      onSettled: () => {},
      onError: () => {},
      reportFailures: true,
      onFailureGone,
    })
    queueJob.mockResolvedValueOnce([upscale('running')])
    listJobs.mockResolvedValueOnce([upscale('failed', "Couldn't reach ComfyUI")])
    await jobs.queue('upscale', 0)
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()
    expect(onFailureGone).not.toHaveBeenCalled()
    retryJob.mockResolvedValueOnce([upscale('queued')])
    await jobs.retry(upscale('failed'))
    await flushPromises()
    expect(onFailureGone.mock.calls).toEqual([["Upscale failed: Couldn't reach ComfyUI"]])
  })

  it('notifies when the whole queue is done while the tab is hidden, if turned on', async () => {
    const shown: { title: string; body?: string }[] = []
    vi.stubGlobal(
      'Notification',
      class {
        static permission = 'granted'
        constructor(title: string, options?: NotificationOptions) {
          shown.push({ title, body: options?.body })
        }
        close() {}
      },
    )
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const { useJobs } = await import('./useJobs')
    const { setCurrentSession } = await import('./useCurrentSession')
    setCurrentSession('s1', 'roleplay', 'The Tavern')
    const run = async (on: boolean, ...lists: Job[][]) => {
      localStorage.setItem('notify-when-done', on ? '1' : '0')
      const jobs = useJobs('s1', { onSettled: () => {}, onError: () => {} })
      queueJob.mockResolvedValueOnce(lists[0])
      for (const list of lists.slice(1)) listJobs.mockResolvedValueOnce(list)
      await jobs.queue('upscale', 0)
      await vi.advanceTimersByTimeAsync(1000 * (lists.length - 1))
      await flushPromises()
    }
    const two = (a: Job['status'], b: Job['status']) => [upscale(a), { ...upscale(b), id: 'j2' }]

    // Not while one of two is still running; once both are, saying how many failed.
    await run(true, two('running', 'queued'), two('done', 'running'), two('done', 'failed'))
    expect(shown).toEqual([
      { title: 'The Tavern', body: 'The queue is done, 1 failed.' },
    ])
    shown.length = 0
    await run(false, [upscale('running')], [upscale('done')])
    visibility.mockReturnValue('visible')
    await run(true, [upscale('running')], [upscale('done')])
    expect(shown).toEqual([])
    vi.unstubAllGlobals()
    visibility.mockRestore()
    localStorage.clear()
  })

  it("counts a render as the Frame's only if it's by the Session's Image Model", async () => {
    const { useJobs } = await import('./useJobs')
    let model = 'krea-2'
    const jobs = useJobs('s1', { onSettled: () => {}, onError: () => {}, imageModel: () => model })
    const image = { imageBackend: 'mflux' as const, imageModel: 'krea-2', steps: 20 }
    queueJob.mockResolvedValueOnce([
      { id: 'j1', kind: 'render', frameIndex: 0, status: 'queued', createdAt: '', image },
    ])
    await jobs.queue('render', 0)
    expect(jobs.hasJob(0, 'render')).toBe(true)
    model = 'flux2-klein'
    expect(jobs.hasJob(0, 'render')).toBe(false)
  })
})
