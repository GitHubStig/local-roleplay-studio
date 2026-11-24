import { ref } from 'vue'
import { listSessions, renameSession as sendRename, type SessionSummary } from '../api'

/**
 * The Sessions in the Session folder, as the server lists them: one copy for the whole app, so
 * Home, the rail's Current Session and the done notice all show a Session's title as it is now.
 * Null until it's first loaded.
 */
const sessions = ref<SessionSummary[] | null>(null)
/** Why the last load failed, or ''. */
const listError = ref('')

/**
 * Loads the list again, one load at a time. A call while one runs gets the load after it (calls
 * meanwhile share it), so a list asked for after a change (an import, say) is never from before it.
 */
let loading: Promise<void> | null = null
let next: Promise<void> | null = null
export function loadSessions(): Promise<void> {
  if (loading) {
    return (next ??= loading.then(() => {
      next = null
      return loadSessions()
    }))
  }
  loading = listSessions()
    .then((list) => {
      sessions.value = list
      listError.value = ''
    })
    .catch((err: Error) => {
      listError.value = err.message
    })
    .finally(() => {
      loading = null
    })
  return loading
}

/** Renames Session `id`, and shows the new title wherever it's listed; it comes back as saved. */
export async function renameSession<S extends { title: string }>(id: string, title: string) {
  const saved = await sendRename<S>(id, title)
  const listed = sessions.value?.find((s) => s.id === id)
  if (listed) listed.title = saved.title
  return saved
}

/** Drops Session `id` from the list, once it's deleted. */
export function forgetSession(id: string) {
  if (sessions.value) sessions.value = sessions.value.filter((s) => s.id !== id)
}

export function useSessionList() {
  return { sessions, listError }
}
