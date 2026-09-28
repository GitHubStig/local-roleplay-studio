import { computed, type WritableComputedRef } from 'vue'
import { useStoredString } from './storage'

/**
 * An on/off viewing preference remembered per browser (like the theme): off unless stored as on.
 * Stored as '1', removed when off. If storage is blocked, the flag still works for this visit.
 */
export function useStoredFlag(key: string): WritableComputedRef<boolean> {
  const stored = useStoredString(key)
  return computed({
    get: () => stored.value === '1',
    set: (on) => (stored.value = on ? '1' : null),
  })
}
