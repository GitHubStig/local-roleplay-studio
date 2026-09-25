import { type Ref, ref, watch } from 'vue'

/**
 * Text remembered per browser under `key`, e.g. an unsent Action, so it survives a reload. Emptying
 * it forgets it. Storage can be blocked (private mode); the text then just isn't remembered.
 */
export function useStoredText(key: string): Ref<string> {
  let initial = ''
  try {
    initial = localStorage.getItem(key) ?? ''
  } catch {
    // Not readable; start empty.
  }
  const text = ref(initial)
  watch(text, (value) => {
    try {
      if (value) localStorage.setItem(key, value)
      else localStorage.removeItem(key)
    } catch {
      // Not remembered this time.
    }
  }, { flush: 'sync' })
  return text
}
