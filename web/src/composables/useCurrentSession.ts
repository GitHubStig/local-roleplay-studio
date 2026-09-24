import { ref } from 'vue'

const STORAGE_KEY = 'current-session'

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** The active Session the player is in, so Play can lead back to it. Remembered per browser. */
const currentSessionId = ref<string | null>(read())

export function setCurrentSession(id: string) {
  currentSessionId.value = id
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Not remembered across reloads this time.
  }
}

/** Forgets `id` if it's the current Session (it ended, or no longer exists). */
export function clearCurrentSession(id: string) {
  if (currentSessionId.value !== id) return
  currentSessionId.value = null
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing stored.
  }
}

export function useCurrentSession() {
  return { currentSessionId }
}
