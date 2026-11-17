import { computed, ref } from 'vue'
import { type Feature, getSettings, type Settings } from '../api'
import { loadSettingsOptions, settingsOptionsError, useSettingsOptions } from './useSettingsOptions'

/** Settings as they are now, with the Features switched on; loaded once, shared. */
const settings = ref<Settings | null>(null)
/** Why Settings last failed to load, or '' once they have. */
const settingsError = ref('')
let loading: Promise<void> | null = null

/** Loads them again, e.g. once Settings are saved: what's switched on, and what can run. */
async function refreshFeatures() {
  try {
    const [, loaded] = await Promise.all([loadSettingsOptions(), getSettings()])
    settings.value = loaded
    settingsError.value = ''
  } catch (err) {
    // Until they load, everything shows, and the server says if something's off.
    settingsError.value = (err as Error).message
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
  /** Why Settings or their options couldn't be loaded, or '' while they could. */
  const loadError = computed(() => settingsError.value || settingsOptionsError.value)
  return { on, refreshFeatures, settings, options, loadError }
}
