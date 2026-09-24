import { ref, watch } from 'vue'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Storage blocked (private mode etc.): fall back to following the system.
  }
  return 'system'
}

function writePreference(pref: ThemePreference) {
  try {
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    // Not persisted this time; the choice still applies until reload.
  }
}

function apply(pref: ThemePreference) {
  const dark = pref === 'dark' || (pref === 'system' && media().matches)
  document.documentElement.classList.toggle('dark', dark)
}

const preference = ref<ThemePreference>(readPreference())
let started = false

/** Shared light/dark/system preference, applied to <html> and remembered per browser. */
export function useTheme() {
  if (!started) {
    started = true
    apply(preference.value)
    watch(preference, (pref) => {
      writePreference(pref)
      apply(pref)
    })
    media().addEventListener('change', () => {
      if (preference.value === 'system') apply('system')
    })
  }
  return { preference }
}
