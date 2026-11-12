import { useIntervalFn } from '@vueuse/core'
import { effectScope, onScopeDispose, ref } from 'vue'
import { getQueue, type Queue } from '../api'

/**
 * Every machine's queue (`GET /api/queue`), polled once for the whole app while anything shows it:
 * the rail's count, its slide-in panel, the Queue page. Every 2 s; `refresh` asks at once (after a
 * cancel, say). The poll stops when the last user goes.
 */
const queue = ref<Queue | null>(null)
const error = ref('')
/** When it was last asked, for how long each job has run. */
const now = ref(Date.now())
let users = 0
let scope: ReturnType<typeof effectScope> | null = null

async function refresh() {
  try {
    queue.value = await getQueue()
    error.value = ''
  } catch (err) {
    error.value = (err as Error).message
  }
  now.value = Date.now()
}

export function useQueue() {
  if (users++ === 0) {
    scope = effectScope(true)
    scope.run(() => useIntervalFn(refresh, 2000, { immediateCallback: true }))
  }
  onScopeDispose(() => {
    if (--users === 0) {
      scope?.stop()
      scope = null
    }
  })
  return { queue, error, now, refresh }
}
