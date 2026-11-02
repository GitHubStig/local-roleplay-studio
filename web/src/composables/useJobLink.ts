import { type Ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Job } from '../api'
import { type JobPlaces, openJob } from '../jobs'

/**
 * Opens the job a link to the Session's screen names (`jobLink`, from the queue page) as its own
 * Queue tab would (`openJob`), once the Session has loaded (`ready`); its Frame alone if the job is
 * gone by then. The link's query is cleared after, so going back doesn't open it again.
 */
export function useJobLink(
  path: () => string,
  ready: () => boolean,
  jobs: Ref<Job[]>,
  refreshJobs: () => Promise<void>,
  to: JobPlaces,
) {
  const route = useRoute()
  const router = useRouter()
  watch(
    () => [route.path === path() && ready() && route.query.job, route.query.frame] as const,
    async ([id, frame]) => {
      if (typeof id !== 'string') return
      await router.replace({ path: path() })
      await refreshJobs()
      const job = jobs.value.find((j) => j.id === id)
      if (job) openJob(job, to)
      else if (typeof frame === 'string' && Number.isInteger(Number(frame))) to.go(Number(frame))
    },
    { immediate: true },
  )
}
