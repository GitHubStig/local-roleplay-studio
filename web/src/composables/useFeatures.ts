import { computed, ref } from 'vue'
import { type Feature, getSettings, type Settings } from '../api'
import { loadSettingsOptions, useSettingsOptions } from './useSettingsOptions'

/** Settings as they are now, with the Features switched on; loaded once, shared. */
const settings = ref<Settings | null>(null)
let loading: Promise<void> | null = null

/** Loads them again, e.g. once Settings are saved: what's switched on, and what can run. */
async function refreshFeatures() {
  try {
    const [, loaded] = await Promise.all([loadSettingsOptions(), getSettings()])
    settings.value = loaded
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
  // Which this machine can run, from the Settings options.
  const options = useSettingsOptions()
  const on = computed(() => (feature: Feature) =>
    (options.value?.features?.[feature]?.available ?? true) &&
    (settings.value?.features?.[feature] ?? true)
  )
  return { on, refreshFeatures, settings }
}
