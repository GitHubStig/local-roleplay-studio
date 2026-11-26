import { computed, type Ref, ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import {
  type Backend,
  checkComfyUI,
  type ComfyStatus,
  listTextModels,
  type Settings,
  type SettingsOptions,
  type TextModelList,
  type Work,
} from '../api'
import { useWhereTo } from './useWhereTo'

/**
 * The Backends as Settings' form stands (ADR 0022): which can do each kind of work, where each
 * goes (as the server's `pickBackend` works it out), whether each ComfyUI answers and has what
 * would go there, and what each text Backend lists. Checked again as the form changes.
 */
export function useBackends(
  form: Ref<Settings | null>,
  options: Ref<SettingsOptions | null>,
  /** New API keys typed, by Backend id, to list a text Backend's models with before they're saved. */
  apiKeys: Ref<Record<string, string>>,
) {
  const { does, whereTo } = useWhereTo(form, options)

  /** The Backends that can do a kind of work, for its tab to choose from. */
  const choicesFor = (work: Work) => (form.value?.backends ?? []).filter((b) => does(b, work))

  /** Each ComfyUI listed, up or down, with what would go there. */
  const comfy = ref<Record<string, ComfyStatus | 'checking'>>({})
  /**
   * The ComfyUI clips go to, as the server picks it (`backendOf`'s `video`): the one Settings name
   * for them, else the one pictures go to, if they go to one, else the first listed.
   */
  const clipsTo = computed(() => comfyFor(form.value?.videoOn))
  /** The ComfyUI music goes to, as the server picks it (`backendOf`'s `music`), the same way. */
  const musicTo = computed(() => comfyFor(form.value?.musicOn))
  function comfyFor(named?: string) {
    const comfyuis = (form.value?.backends ?? []).filter((b) => b.kind === 'comfyui')
    return comfyuis.find((b) => b.id === named) ??
      comfyuis.find((b) => b.id === form.value?.runOn.images) ?? comfyuis[0]
  }
  async function checkComfy(backend: Backend) {
    if (!form.value) return
    const goes = (work: Work) => whereTo(work)?.id === backend.id
    comfy.value[backend.id] = 'checking'
    comfy.value[backend.id] = await checkComfyUI(backend.address, {
      imageModel: goes('images') ? form.value.imageModel : undefined,
      upscaler: goes('upscale') ? form.value.upscaler : undefined,
      voices: goes('voices') || undefined,
      videoModel: clipsTo.value?.id === backend.id ? form.value.videoModel : undefined,
      music: (form.value.music && musicTo.value?.id === backend.id) || undefined,
      // The face pass goes where edits go, by its own edit model.
      faceEditModel: form.value.features.sheets &&
          whereTo('edits', form.value.faceEditModel)?.id === backend.id
        ? form.value.faceEditModel
        : undefined,
    }).catch((err) => ({ up: false as const, error: (err as Error).message }))
  }
  const comfyuis = computed(() => form.value?.backends.filter((b) => b.kind === 'comfyui') ?? [])
  // Checked as they're added, and again as an address or what goes there changes.
  watchDebounced(
    () =>
      form.value && JSON.stringify([
        comfyuis.value,
        form.value.runOn,
        form.value.imageModel,
        form.value.upscaler,
        form.value.editModel,
        form.value.videoModel,
        form.value.videoOn,
        form.value.musicOn,
        form.value.music,
        form.value.faceEditModel,
        form.value.features.sheets,
      ]),
    () => Promise.all(comfyuis.value.map(checkComfy)),
    { debounce: 500, immediate: true },
  )

  /** What each text Backend listed lists, or why it couldn't. */
  const text = ref<Record<string, TextModelList>>({})
  async function listText(backend: Backend) {
    const apiKey = apiKeys.value[backend.id] || undefined
    text.value[backend.id] = await listTextModels({ ...backend, apiKey }).catch((err) => ({
      textModels: [],
      thinkingModels: [],
      textModelsError: (err as Error).message,
    }))
  }
  const texts = computed(() => form.value?.backends.filter((b) => does(b, 'text')) ?? [])
  // Listed as they're added, and again as an address or a key typed changes.
  watchDebounced(
    () => JSON.stringify([texts.value, apiKeys.value]),
    () => Promise.all(texts.value.map(listText)),
    { debounce: 500, immediate: true },
  )

  return { does, choicesFor, whereTo, clipsTo, musicTo, comfy, checkComfy, text }
}
