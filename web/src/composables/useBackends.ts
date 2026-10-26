import { computed, type Ref, ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import {
  type Backend,
  BACKEND_WORK,
  checkComfyUI,
  type ComfyStatus,
  listTextModels,
  type Settings,
  type SettingsOptions,
  type TextModelOptions,
  type Work,
} from '../api'

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
  /** Whether a Backend can do a kind of work at all: this machine only what it runs itself. */
  const does = (backend: Backend, work: Work) =>
    BACKEND_WORK[backend.kind].includes(work) &&
    (backend.kind !== 'here' || work === 'text' || !!options.value?.here[work]?.available)

  /** The Backends that can do a kind of work, for its tab to choose from. */
  const choicesFor = (work: Work) => (form.value?.backends ?? []).filter((b) => does(b, work))

  /**
   * Whether a Backend can do this job: a render where its kind of Backend has the Image Model, an
   * edit on its edit model's kind.
   */
  function can(backend: Backend, work: Work): boolean {
    if (!does(backend, work)) return false
    const kind = backend.kind === 'here' ? 'mflux' : 'comfyui'
    if (work === 'images') {
      return !!options.value?.imageModels[kind]?.some((m) => m.id === form.value?.imageModel)
    }
    if (work === 'edits') {
      const model = options.value?.editModels.find((m) => m.id === form.value?.editModel)
      return !model || model.backend === kind
    }
    return true
  }

  /** Where a kind of work goes: the preferred Backend if it can, else the next listed that can. */
  function whereTo(work: Work): Backend | undefined {
    if (!form.value) return undefined
    const { backends, runOn } = form.value
    return [
      ...backends.filter((b) => b.id === runOn[work]),
      ...backends.filter((b) => b.id !== runOn[work]),
    ].find((b) => can(b, work))
  }

  /** Each ComfyUI listed, up or down, with what would go there. */
  const comfy = ref<Record<string, ComfyStatus | 'checking'>>({})
  async function checkComfy(backend: Backend) {
    if (!form.value) return
    const goes = (work: Work) => whereTo(work)?.id === backend.id
    comfy.value[backend.id] = 'checking'
    comfy.value[backend.id] = await checkComfyUI(backend.address, {
      imageModel: goes('images') ? form.value.imageModel : undefined,
      upscaler: goes('upscale') ? form.value.upscaler : undefined,
      voices: goes('voices') || undefined,
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
      ]),
    () => Promise.all(comfyuis.value.map(checkComfy)),
    { debounce: 500, immediate: true },
  )

  /** What each text Backend listed lists, or why it couldn't. */
  const text = ref<Record<string, TextModelOptions>>({})
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

  return { does, choicesFor, whereTo, comfy, checkComfy, text }
}
