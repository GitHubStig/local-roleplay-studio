import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  cancelAllJobs,
  cancelJob,
  type ClipOrder,
  dismissFinishedJobs,
  type EditOrder,
  type Job,
  type JobKind,
  listJobs,
  queueClip as queueClipJob,
  queueEdit as queueEditJob,
  queueJob,
  retryJob,
} from '../api'
import { isOpen, JOB_NAMES } from '../jobs'
import { useDoneNotice } from './useDoneNotice'

/** Of several running jobs, the one to show: a render, else a picture, else the first. */
const mainJob = (running: Job[]): Job | null =>
  running.find((j) => j.kind === 'render') ?? running.find((j) => j.kind === 'picture') ??
    running[0] ?? null

/**
 * A Session's queued background work (a Roleplay's or a Chain's), followed while anything is
 * queued or running. A job that finishes or fails has changed the Session, so `onSettled` reloads
 * it; `onError` hears why a job couldn't be queued, and, with `reportFailures`, why one failed
 * (for a view that shows failures only in its Queue tab), then `onFailureGone` hears the same
 * words once that job isn't failed any more (retried or dismissed), for the view to clear them. When the whole queue has finished, it
 * may notify the player (`useDoneNotice`). `imageModel` is the Session's Image
 * Model: a render queued by another one doesn't count as its render (`hasJob`).
 */
export function useJobs(
  sessionId: string,
  opts: {
    onSettled: () => Promise<void> | void
    onError: (message: string) => void
    reportFailures?: boolean
    onFailureGone?: (message: string) => void
    imageModel?: () => string | undefined
  },
) {
  /** In the order queued, failed and done ones until dismissed. */
  const jobs = ref<Job[]>([])
  const openJobs = computed(() => jobs.value.filter(isOpen))
  /** The jobs running: at most one per machine, so a render on another PC runs beside a line here. */
  const runningJobs = computed(() => jobs.value.filter((j) => j.status === 'running'))
  /** The running job to show, of several: a render (its picture forms), else a picture, else the first. */
  const runningJob = computed(() => mainJob(runningJobs.value))
  /** A Frame's running job to show, as `runningJob` picks it. */
  const runningOn = (index: number) =>
    mainJob(runningJobs.value.filter((j) => j.frameIndex === index))
  /** A Frame's queued, running and failed jobs, in queue order (a done one's work is on the Frame). */
  const jobsFor = (index: number) =>
    jobs.value.filter((j) => j.frameIndex === index && j.status !== 'done')
  /**
   * A job of this kind is already queued or running on this Frame; for a render, by the Session's
   * Image Model.
   */
  const hasJob = (index: number, kind: JobKind) =>
    openJobs.value.some((j) =>
      j.frameIndex === index && j.kind === kind &&
      (!j.image || !opts.imageModel || j.image.imageModel === opts.imageModel())
    )

  const notifyDone = useDoneNotice()

  /** The failures reported (`reportFailures`), by job, until the job isn't failed any more. */
  const reported = new Map<string, string>()
  watch(jobs, (list) => {
    for (const [id, message] of reported) {
      if (list.some((j) => j.id === id && j.status === 'failed')) continue
      reported.delete(id)
      opts.onFailureGone?.(message)
    }
  })

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
    const settled = openJobs.value.some((j) => !now.some((n) => n.id === j.id && isOpen(n)))
    const failed = now.filter((n) =>
      n.status === 'failed' && openJobs.value.some((j) => j.id === n.id)
    )
    if (openJobs.value.length && !now.some(isOpen)) {
      notifyDone(sessionId, now.filter((n) => n.status === 'failed').length)
    }
    jobs.value = now
    if (opts.reportFailures) {
      for (const job of failed) {
        const message = `${JOB_NAMES[job.kind]} failed: ${job.error}`
        reported.set(job.id, message)
        opts.onError(message)
      }
    }
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
  /** Queues an edit of a Frame's picture (ADR 0021). */
  async function queueEdit(index: number, order: EditOrder) {
    try {
      jobs.value = await queueEditJob(sessionId, index, order)
      watchJobs()
    } catch (err) {
      opts.onError((err as Error).message)
    }
  }
  /** Queues a clip of a Frame's picture. */
  async function queueClip(index: number, order: ClipOrder) {
    try {
      jobs.value = await queueClipJob(sessionId, index, order)
      watchJobs()
    } catch (err) {
      opts.onError((err as Error).message)
    }
  }
  /** Queues a `kind` job on each of these Frames, in order. */
  async function queueAll(kind: JobKind, indexes: readonly number[]) {
    for (const index of indexes) await queue(kind, index)
  }
  /** Cancels a queued or running job, or dismisses a failed or done one. */
  async function dropJob(job: Job) {
    try {
      jobs.value = await cancelJob(sessionId, job.id)
    } catch {
      await refreshJobs()
    }
  }
  /** Cancels everything running and queued; what's finished stays. */
  async function cancelAll() {
    try {
      jobs.value = await cancelAllJobs(sessionId)
      watchJobs()
    } catch {
      await refreshJobs()
    }
  }
  /** Dismisses every finished job, done or failed. */
  async function dismissFinished() {
    try {
      jobs.value = await dismissFinishedJobs(sessionId)
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

  /** Whether work on Frame `index` (of `jobs`, its own by default) runs, or only waits its turn. */
  const workOn = (
    index: number,
    of: readonly Job[] = jobsFor(index),
  ): 'running' | 'queued' | null => {
    const open = of.filter(isOpen)
    return open.some((j) => j.status === 'running') ? 'running' : open.length ? 'queued' : null
  }
  /** For a Frame's buttons: whether a job of each kind on Frame `index` runs, or waits. */
  const workOf = (index: number) => (kind: JobKind) =>
    workOn(index, jobsFor(index).filter((j) => j.kind === kind))
  /**
   * Cancels a Frame's jobs one by one (by `drop`, `dropJob` unless the Session's own does more),
   * skipping any a cancel before took with it.
   */
  async function dropEach(list: readonly Job[], drop: (job: Job) => Promise<void> = dropJob) {
    for (const job of list) {
      if (jobs.value.some((j) => j.id === job.id && isOpen(j))) await drop(job)
    }
  }

  return {
    jobs,
    openJobs,
    workOn,
    workOf,
    dropEach,
    runningJobs,
    runningJob,
    runningOn,
    jobsFor,
    hasJob,
    queue,
    queueEdit,
    queueClip,
    queueAll,
    dropJob,
    cancelAll,
    dismissFinished,
    retry,
    refreshJobs,
  }
}
