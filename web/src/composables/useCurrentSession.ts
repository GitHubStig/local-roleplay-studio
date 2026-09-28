import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'
import type { SessionKind } from '../api'

/**
 * Saved at once, so a reload right after never loses it; not synced from other tabs, so each tab's
 * Play leads back to what it was playing.
 */
const options = { writeDefaults: false, flush: 'sync', listenToStorageChanges: false } as const
/** The active Session the player is in, so Play can lead back to it. Remembered per browser. */
const storedId = useLocalStorage<string | null>('current-session', null, options)
const storedKind = useLocalStorage<string | null>('current-session-kind', null, options)

const currentSessionId = computed(() => storedId.value)
/** Its kind, which decides which screen Play opens. */
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
