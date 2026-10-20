import { ref } from 'vue'
import {
  getSettingsOptions,
  IMAGE_BACKEND_NAMES,
  type ImageBackend,
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
  const jobName = (job: Job) => JOB_NAMES[job.kind] + (job.image ? ` ${byOf(job.image)}` : '')
  return { modelsOf, find, labelOf, byOf, renderedParts, jobName }
}
