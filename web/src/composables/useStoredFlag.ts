import { type Ref, ref, watch } from 'vue'

/**
 * An on/off viewing preference remembered per browser (like the theme): off unless stored as on.
 * Storage can be blocked (private mode); the flag then still works, it just isn't remembered.
 */
export function useStoredFlag(key: string): Ref<boolean> {
  let initial = false
  try {
    initial = localStorage.getItem(key) === '1'
  } catch {
    // Not readable; start off.
  }
  const flag = ref(initial)
  watch(flag, (on) => {
    try {
      if (on) localStorage.setItem(key, '1')
      else localStorage.removeItem(key)
    } catch {
      // Not remembered this time.
    }
  })
  return flag
}
