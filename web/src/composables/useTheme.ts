import { type BasicColorMode, useColorMode } from '@vueuse/core'
import { computed, effectScope } from 'vue'
import { useStoredString } from './storage'

export type ThemePreference = 'light' | 'dark' | 'system'

/**
 * The stored choice, as useColorMode sees it: 'light', 'dark', or 'auto' for the system. Stored
 * under `theme` as 'light' or 'dark', and removed for the system; anything else stored counts as
 * the system. index.html's pre-paint script reads the same key.
 */
function themeStore() {
  const stored = useStoredString('theme')
  return computed<BasicColorMode | 'auto'>({
    get: () => (stored.value === 'light' || stored.value === 'dark' ? stored.value : 'auto'),
    set: (mode) => (stored.value = mode === 'auto' ? null : mode),
  })
}

/**
 * One color mode for the whole app, in a scope of its own: its watchers and system-theme listener
 * then outlive whichever component first asked for it (a remounted ThemeToggle, a hot reload).
 */
const scope = effectScope(true)
let mode: ReturnType<typeof useColorMode> | undefined

/** Shared light/dark/system preference, applied to <html> as the `dark` class. */
export function useTheme() {
  mode ??= scope.run(() =>
    useColorMode({ storageRef: themeStore(), modes: { light: '', dark: 'dark' } })
  )!
  const store = mode.store
  const preference = computed<ThemePreference>({
    get: () => (store.value === 'auto' ? 'system' : store.value as 'light' | 'dark'),
    set: (pref) => (store.value = pref === 'system' ? 'auto' : pref),
  })
  return { preference }
}
