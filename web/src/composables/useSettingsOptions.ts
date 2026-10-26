import { ref } from 'vue'
import {
  getSettingsOptions,
  IMAGE_BACKEND_NAMES,
  type ImageBackend,
  type ImageModelOption,
  type Job,
  type Picture,
  type SettingsOptions,
} from '../api'
import { JOB_NAMES } from '../jobs'

/** What Settings can be set to (Image Models, Features…), loaded once and shared. */
const options = ref<SettingsOptions | null>(null)
let loading: Promise<void> | null = null

/** Loads them again, e.g. once Settings are saved. */
export function loadSettingsOptions(): Promise<void> {
  loading = (async () => {
    try {
      options.value = await getSettingsOptions()
    } catch {
      // Until they load, screens make do without them, and the server says if something's off.
    }
  })()
  return loading
}

/** The Settings options, null until loaded. */
export function useSettingsOptions() {
  if (!loading) loadSettingsOptions()
  return options
}

/** Each Image backend's models, by name. */
export function useImageModels() {
  const options = useSettingsOptions()
  const modelsOf = (backend: ImageBackend) => options.value?.imageModels?.[backend] ?? []
  const find = (id: string) =>
    Object.values(options.value?.imageModels ?? {}).flat().find((m) => m.id === id)
  /** An Image Model's name, or its id until the names load. */
  const labelOf = (id: string) => find(id)?.label ?? id
  /** "by Qwen-Image 2.1 · ComfyUI": what rendered a picture (or renders a job), its backend if it says. */
  const byOf = (picture: Pick<Picture, 'imageModel' | 'imageBackend'>) =>
    `by ${labelOf(picture.imageModel)}` +
    (picture.imageBackend ? ` · ${IMAGE_BACKEND_NAMES[picture.imageBackend]}` : '')
  /** "Waited 12.3 s · Image 5.1 s · by Qwen-Image 2.1 · mflux": how a picture was rendered. */
  const renderedParts = (picture: Picture) => {
    const t = picture.timings
    return [
      ...(t?.queued !== undefined ? [`Waited ${t.queued.toFixed(1)} s`] : []),
      ...(t ? [`Image ${t.image.toFixed(1)} s`] : []),
      byOf(picture),
    ]
  }
  /** "Render by Krea 2 · mflux": what a job is called, with the Image Model a render goes by. */
  const jobName = (job: Job) =>
    JOB_NAMES[job.kind] +
    (job.image
      ? ` ${byOf({ imageModel: job.image.imageModel, imageBackend: job.imageBackend })}`
      : '')
  return { modelsOf, find, labelOf, byOf, renderedParts, jobName }
}

/**
 * The edit models to choose from, named with their backend where they're on more than one, and
 * which to start on: the first of `wanted` that runs here, or else the first that does.
 */
export function editModelChoices(models: SettingsOptions['editModels'] = []) {
  const backends = new Set(models.map((m) => m.backend))
  const choices = models.map((m) => ({
    id: m.id,
    label: backends.size > 1 ? `${m.label} · ${IMAGE_BACKEND_NAMES[m.backend]}` : m.label,
  }))
  const startOn = (...wanted: (string | undefined)[]) =>
    wanted.find((id) => choices.some((c) => c.id === id)) ?? choices[0]?.id ??
      wanted.find(Boolean) ??
      ''
  return { choices, startOn }
}

/**
 * Image Model `id` as the screens see it (ADR 0022: the same name is the same model): `prefer`'s
 * if that kind of backend has it, else the first that does.
 */
export function imageModelOf(
  options: SettingsOptions | null | undefined,
  id: string,
  prefer?: ImageBackend,
): ImageModelOption | undefined {
  const on = (backend: ImageBackend) => options?.imageModels[backend]?.find((m) => m.id === id)
  return (prefer && on(prefer)) ??
    (Object.keys(options?.imageModels ?? {}) as ImageBackend[]).map(on).find(Boolean)
}

/**
 * The Image Models to choose from, by name: each one a kind of backend that can render here has
 * (`backends`, as Settings were saved unless told), once, and always `own` (the Session's, or
 * Settings'), wherever it runs. Each is named as the backend it renders on (`on`) names it: a
 * model may be quantized on one ("Z-Image Turbo (4-bit)") and not on another.
 */
export function imageModelChoices(
  options: SettingsOptions | null | undefined,
  own?: string,
  backends: readonly ImageBackend[] = options?.imageBackends ?? [],
  on: (id: string) => ImageBackend | undefined = (id) => options?.imageModelsOn?.[id],
): { id: string; label: string }[] {
  const ids = new Set<string>()
  for (const backend of backends) {
    for (const { id } of options?.imageModels[backend] ?? []) ids.add(id)
  }
  if (own) ids.add(own)
  return [...ids].map((id) => ({ id, label: imageModelOf(options, id, on(id))?.label ?? id }))
}
