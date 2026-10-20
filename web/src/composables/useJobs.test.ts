import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from '../api'

const listJobs = vi.fn()
const queueJob = vi.fn()
vi.mock('../api', () => ({ listJobs, queueJob }))

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
