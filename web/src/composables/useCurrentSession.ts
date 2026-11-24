import { computed, readonly } from 'vue'
import type { SessionKind } from '../api'
import { browserStorage, useStoredString } from './storage'
import { loadSessions, useSessionList } from './useSessionList'

/** The active Session the player is in, so Current Session can lead back to it. Remembered per browser. */
const storedId = useStoredString('current-session')
const storedKind = useStoredString('current-session-kind')
// Its title was kept here too until Sessions could be renamed; it's read from the Session list now.
browserStorage().removeItem('current-session-title')

const { sessions } = useSessionList()

const currentSessionId = readonly(storedId)
/** Its kind, which decides which screen Current Session opens. */
const currentSessionKind = computed<SessionKind>(() =>
  storedKind.value === 'storyboard' || storedKind.value === 'roleplay' ? storedKind.value : 'chain'
)

/** Its title as it is now, from the Session list; '' until that's loaded. */
const currentSessionTitle = computed(() =>
  sessions.value?.find((s) => s.id === storedId.value)?.title ?? ''
)

export function setCurrentSession(id: string, kind: SessionKind = 'chain') {
  storedId.value = id
  storedKind.value = kind
  // A Session just started isn't listed yet.
  if (sessions.value && !sessions.value.some((s) => s.id === id)) void loadSessions()
}

/** Forgets `id` if it's the current Session (it ended, or no longer exists). */
export function clearCurrentSession(id: string) {
  if (storedId.value !== id) return
  storedId.value = null
  storedKind.value = null
}

export function useCurrentSession() {
  return { currentSessionId, currentSessionKind, currentSessionTitle }
}
