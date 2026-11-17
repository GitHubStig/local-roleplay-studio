import { useIntervalFn } from '@vueuse/core'
import { onMounted, ref } from 'vue'
import { type Job, type JobKind, listJobs } from '../api'

/**
 * A Session's latest job of `kind`, for a part of a screen that queues its own (the style scores,
 * the Compare dialog's export): found as it mounts, or given as it's queued (`follow`), then
 * looked at each second while `followed` says so. `gone` hears that it isn't listed any more.
 */
export function useJobOf(
  sessionId: string,
  kind: JobKind,
  opts: { followed: (job: Job) => boolean; gone?: () => Promise<void> | void },
) {
  const job = ref<Job | null>(null)
  const latest = (jobs: Job[]) => jobs.filter((j) => j.kind === kind).at(-1) ?? null
  const following = () => !!job.value && opts.followed(job.value)

  async function refresh() {
    const was = job.value
    job.value = latest(await listJobs(sessionId).catch(() => []))
    if (was && !job.value) await opts.gone?.()
    if (!following()) pause()
  }
  const { pause, resume } = useIntervalFn(refresh, 1000, { immediate: false })

  /** Follows the job of `kind` among `jobs`, as the queue was sent back when it was queued. */
  function follow(jobs: Job[]) {
    job.value = latest(jobs)
    if (following()) resume()
  }

  onMounted(async () => {
    await refresh()
    if (following()) resume()
  })
  return { job, follow }
}
