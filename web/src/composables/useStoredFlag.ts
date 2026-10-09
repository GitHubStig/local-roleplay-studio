import { computed, type WritableComputedRef } from 'vue'
import { useStoredString } from './storage'

/**
 * An on/off viewing preference remembered per browser (like the theme): `fallback` (off) unless
 * stored otherwise. Stored as '1' or '0', removed when it's back to the fallback. If storage is
 * blocked, the flag still works for this visit.
 */
export function useStoredFlag(key: string, fallback = false): WritableComputedRef<boolean> {
  const stored = useStoredString(key)
  return computed({
    get: () => (stored.value === null ? fallback : stored.value === '1'),
    set: (on) => (stored.value = on === fallback ? null : on ? '1' : '0'),
  })
}
