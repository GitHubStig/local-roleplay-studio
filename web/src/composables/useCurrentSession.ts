import { computed, readonly } from 'vue'
import type { SessionKind } from '../api'
import { useStoredString } from './storage'

/** The active Session the player is in, so Current Session can lead back to it. Remembered per browser. */
const storedId = useStoredString('current-session')
const storedKind = useStoredString('current-session-kind')

const currentSessionId = readonly(storedId)
/** Its kind, which decides which screen Current Session opens. */
const currentSessionKind = computed<SessionKind>(() =>
  storedKind.value === 'storyboard' || storedKind.value === 'roleplay' ? storedKind.value : 'chain'
)

export function setCurrentSession(id: string, kind: SessionKind = 'chain') {
  storedId.value = id
  storedKind.value = kind
}

/** Forgets `id` if it's the current Session (it ended, or no longer exists). */
export function clearCurrentSession(id: string) {
  if (storedId.value !== id) return
  storedId.value = null
  storedKind.value = null
}

export function useCurrentSession() {
  return { currentSessionId, currentSessionKind }
}
