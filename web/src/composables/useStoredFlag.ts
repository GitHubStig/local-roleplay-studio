import { useLocalStorage } from '@vueuse/core'
import { computed, type WritableComputedRef } from 'vue'

/**
 * An on/off viewing preference remembered per browser (like the theme): off unless stored as on.
 * Stored as '1', removed when off. Storage can be blocked (private mode); the flag still works,
 * it just isn't remembered.
 */
export function useStoredFlag(key: string): WritableComputedRef<boolean> {
  const stored = useLocalStorage<string | null>(key, null, { writeDefaults: false, flush: 'sync' })
  return computed({
    get: () => stored.value === '1',
    set: (on) => (stored.value = on ? '1' : null),
  })
}
