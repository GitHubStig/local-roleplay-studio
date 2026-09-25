import { ref } from 'vue'
import type { SessionKind } from '../api'

const STORAGE_KEY = 'current-session'
const KIND_KEY = 'current-session-kind'

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function readKind(): SessionKind {
  try {
    return localStorage.getItem(KIND_KEY) === 'storyboard' ? 'storyboard' : 'chain'
  } catch {
    return 'chain'
  }
}

/** The active Session the player is in, so Play can lead back to it. Remembered per browser. */
const currentSessionId = ref<string | null>(read())
/** Its kind, which decides which screen Play opens. */
const currentSessionKind = ref<SessionKind>(readKind())

export function setCurrentSession(id: string, kind: SessionKind = 'chain') {
  currentSessionId.value = id
  currentSessionKind.value = kind
  try {
    localStorage.setItem(STORAGE_KEY, id)
    localStorage.setItem(KIND_KEY, kind)
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
    localStorage.removeItem(KIND_KEY)
  } catch {
    // Nothing stored.
  }
}

export function useCurrentSession() {
  return { currentSessionId, currentSessionKind }
}
