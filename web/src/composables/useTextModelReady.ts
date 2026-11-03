import { computed, onMounted, ref } from 'vue'
import { getSettings, getSettingsOptions, type Settings, type SettingsOptions } from '../api'

/**
 * Whether Settings name a Text Model that's there, which opening a Scenario and starting a Session
 * both need: loaded fresh on mount, as Settings may just have changed.
 */
export function useTextModelReady() {
  const settings = ref<Settings | null>(null)
  const options = ref<SettingsOptions | null>(null)
  const loadError = ref('')

  onMounted(async () => {
    try {
      ;[settings.value, options.value] = await Promise.all([getSettings(), getSettingsOptions()])
    } catch (err) {
      loadError.value = (err as Error).message
    }
  })

  /** Why the Text Model can't be used, or null when it can (and while Settings load). */
  const blocker = computed(() => {
    if (!settings.value || !options.value) return null
    if (!settings.value.textModel) return 'Choose a Text Model in Settings first.'
    if (!options.value.textModels.includes(settings.value.textModel)) {
      return `The Text Model "${settings.value.textModel}" isn't available. Choose one in Settings.`
    }
    return null
  })

  return { loaded: computed(() => !!settings.value && !!options.value), loadError, blocker }
}
