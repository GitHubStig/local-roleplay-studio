import { computed, type WritableComputedRef } from 'vue'
import { useStoredString } from './storage'

/**
 * Text remembered per browser under `key`, e.g. an unsent Action, so it survives a reload. Emptying
 * it forgets it. If storage is blocked, the text works for this visit but isn't remembered.
 */
export function useStoredText(key: string): WritableComputedRef<string> {
  const stored = useStoredString(key)
  return computed({
    get: () => stored.value ?? '',
    set: (text) => (stored.value = text || null),
  })
}
