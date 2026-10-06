import { computed, ref } from 'vue'
import { type Availability, type Feature, getSettings, getSettingsOptions } from '../api'

/** Which Features this machine can run, and which Settings has switched on; loaded once, shared. */
const available = ref<Record<Feature, Availability> | null>(null)
const switchedOn = ref<Record<Feature, boolean> | null>(null)
let loading: Promise<void> | null = null

/** Loads them again, e.g. once Settings are saved. */
async function refreshFeatures() {
  try {
    const [options, settings] = await Promise.all([getSettingsOptions(), getSettings()])
    available.value = options.features
    switchedOn.value = settings.features
  } catch {
    // Until they load, everything shows, and the server says if something's off.
  }
}

/**
 * Whether each Feature is on: this machine can run it and Settings has it switched on. Screens
 * hide what's off; what was already made with it (audio, scenes, figures) still plays and opens.
 * Before they've loaded, everything counts as on.
 */
export function useFeatures() {
  loading ??= refreshFeatures()
  const on = computed(() => (feature: Feature) =>
    (available.value?.[feature]?.available ?? true) && (switchedOn.value?.[feature] ?? true)
  )
  return { on, refreshFeatures }
}
