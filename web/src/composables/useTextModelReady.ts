import { computed, onMounted } from 'vue'
import { useFeatures } from './useFeatures'

/**
 * Whether Settings name a Text Model that's there, which opening a Scenario and starting a Session
 * both need. Read from the Settings every screen shares, which Settings reload as they're saved (so
 * this follows them while it's on screen beneath them), and loaded again on mount, as they may have
 * changed elsewhere since.
 */
export function useTextModelReady() {
  const { settings, options, loadError, refreshFeatures } = useFeatures()
  // The first load is already on its way; only one from before can be out of date.
  onMounted(() => settings.value && refreshFeatures())

  /** Why the Text Model can't be used, or null when it can (and while Settings load). */
  const blocker = computed(() => {
    if (!settings.value || !options.value) return null
    if (!settings.value.textModel) return 'Choose a Text Model in Settings first.'
    if (!options.value.textModels.includes(settings.value.textModel)) {
      return `The Text Model "${settings.value.textModel}" isn't available. Choose one in Settings.`
    }
    return null
  })

  /**
   * Why Pictures are switched on but can't be made here (no Image backend can run them), or null.
   * Switched off, nothing's missing: Sessions run on the Text Model alone.
   */
  const picturesBlocker = computed(() => {
    const images = options.value?.features?.images
    if (!settings.value?.features?.images || !images || images.available) return null
    return images.reason ?? 'Nothing here can render them.'
  })

  return {
    loaded: computed(() => !!settings.value && !!options.value),
    loadError,
    blocker,
    picturesBlocker,
  }
}
