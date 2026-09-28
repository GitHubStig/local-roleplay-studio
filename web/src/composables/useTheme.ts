import { useColorMode } from '@vueuse/core'
import { computed } from 'vue'

export type ThemePreference = 'light' | 'dark' | 'system'

let mode: ReturnType<typeof useColorMode> | undefined

/**
 * Shared light/dark/system preference, applied to <html> as the `dark` class and remembered per
 * browser under `theme` ('light', 'dark', or 'auto' for the system, which the pre-paint script in
 * index.html also reads).
 */
export function useTheme() {
  mode ??= useColorMode({
    storageKey: 'theme',
    modes: { light: '', dark: 'dark' },
    flush: 'sync',
    listenToStorageChanges: false,
  })
  const store = mode.store
  const preference = computed<ThemePreference>({
    get: () => (store.value === 'auto' ? 'system' : store.value as 'light' | 'dark'),
    set: (pref) => (store.value = pref === 'system' ? 'auto' : pref),
  })
  return { preference }
}
