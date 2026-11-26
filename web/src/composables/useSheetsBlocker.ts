import { computed } from 'vue'
import { computedAsync } from '@vueuse/core'
import { checkComfyUI } from '../api'
import { useFeatures } from './useFeatures'
import { useWhereTo } from './useWhereTo'

/**
 * Why a Storyboard or a Roleplay can't have reference sheets on this machine as Settings are now,
 * or null when it can: for the switch in Start's menu, and the Look's before the story begins.
 */
export function useSheetsBlocker() {
  const { on, options, settings } = useFeatures()
  /**
   * Whether the ComfyUI the face pass goes to (where edits go, by its own edit model) lacks that
   * model's files, as Settings' check finds: else the first sheet would fail. Not where it goes to
   * this machine, or the ComfyUI doesn't answer (Settings says so). Settings lists the files.
   */
  const { whereTo } = useWhereTo(settings, options)
  const facesTo = computed(() => {
    const model = settings.value?.faceEditModel
    const backend = model && options.value?.features?.sheets?.available &&
      whereTo('edits', model)
    return backend && backend.kind === 'comfyui' ? { address: backend.address, model } : undefined
  })
  const faceFilesMissing = computedAsync(async () => {
    const to = facesTo.value
    if (!to) return false
    const status = await checkComfyUI(to.address, { faceEditModel: to.model }).catch(() => null)
    return !!(status?.up && status.missing.faceEditModel)
  }, false)
  return computed(() => {
    const can = options.value?.features?.sheets
    if (can && !can.available) return `Not available here: ${can.reason}.`
    if (!on.value('images')) return 'Pictures are off, in Settings.'
    if (faceFilesMissing.value) {
      return "The ComfyUI the face pass goes to doesn't have its files: Settings, Reference sheets, says which."
    }
    return null
  })
}
