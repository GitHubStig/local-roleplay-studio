import { useLocalStorage } from '@vueuse/core'
import { computed, type WritableComputedRef } from 'vue'

/**
 * Text remembered per browser under `key`, e.g. an unsent Action, so it survives a reload. Emptying
 * it forgets it. Storage can be blocked (private mode); the text then just isn't remembered.
 */
export function useStoredText(key: string): WritableComputedRef<string> {
  const stored = useLocalStorage<string | null>(key, null, { writeDefaults: false, flush: 'sync' })
  return computed({
    get: () => stored.value ?? '',
    set: (text) => (stored.value = text || null),
  })
}
