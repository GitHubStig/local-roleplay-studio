import { computed, onBeforeUnmount, ref } from 'vue'
import { cancelJob, clearJobs, type Job, type JobKind, listJobs, queueJob, retryJob } from '../api'

/**
 * A Session's queued background work (a Roleplay's or a Chain's), followed while anything is
 * queued or running. A job that finishes or fails has changed the Session, so `onSettled` reloads
 * it; `onError` hears why a job couldn't be queued.
 */
export function useJobs(
  sessionId: string,
  opts: { onSettled: () => Promise<void> | void; onError: (message: string) => void },
) {
  /** Running, then queued, then failed (until dismissed). */
  const jobs = ref<Job[]>([])
  const openJobs = computed(() => jobs.value.filter((j) => j.status !== 'failed'))
  const runningJob = computed(() => jobs.value.find((j) => j.status === 'running') ?? null)
  /** A Frame's jobs, in queue order. */
  const jobsFor = (index: number) => jobs.value.filter((j) => j.frameIndex === index)
  /** A job of this kind is already queued or running on this Frame. */
  const hasJob = (index: number, kind: JobKind) =>
    openJobs.value.some((j) => j.frameIndex === index && j.kind === kind)

  let timer: ReturnType<typeof setTimeout> | undefined
  function watchJobs() {
    clearTimeout(timer)
    if (openJobs.value.length) timer = setTimeout(refreshJobs, 1000)
  }
  async function refreshJobs() {
    clearTimeout(timer)
    let now: Job[]
    try {
      now = await listJobs(sessionId)
    } catch {
      return
    }
    const settled = openJobs.value.some((j) =>
      !now.some((n) => n.id === j.id && n.status !== 'failed')
    )
    jobs.value = now
    if (settled) await opts.onSettled()
    watchJobs()
  }
  onBeforeUnmount(() => clearTimeout(timer))

  async function queue(kind: JobKind, index: number) {
    try {
      jobs.value = await queueJob(sessionId, kind, index)
      watchJobs()
    } catch (err) {
      opts.onError((err as Error).message)
    }
  }
  /** Queues a `kind` job on each of these Frames, in order. */
  async function queueAll(kind: JobKind, indexes: readonly number[]) {
    for (const index of indexes) await queue(kind, index)
  }
  /** Cancels a queued or running job, or dismisses a failed one. */
  async function dropJob(job: Job) {
    try {
      jobs.value = await cancelJob(sessionId, job.id)
    } catch {
      await refreshJobs()
    }
  }
  /** Cancels everything running and queued, and dismisses what failed. */
  async function clear() {
    try {
      jobs.value = await clearJobs(sessionId)
      watchJobs()
    } catch {
      await refreshJobs()
    }
  }
  /** Puts a failed job back in the queue. */
  async function retry(job: Job) {
    try {
      jobs.value = await retryJob(sessionId, job.id)
      watchJobs()
    } catch {
      await refreshJobs()
    }
  }

  return {
    jobs,
    openJobs,
    runningJob,
    jobsFor,
    hasJob,
    queue,
    queueAll,
    dropJob,
    clear,
    retry,
    refreshJobs,
  }
}
