import type { ImageBackendKind } from './imageModels.ts'

/**
 * The edit models (ADR 0021): each repaints a picture as told, in an area painted over it, whatever
 * model rendered the picture. Each runs on one backend, so the same model on mflux and on ComfyUI
 * is two entries; Settings offers those this machine can run (`editModelsHere`).
 */
export const EDIT_MODELS = [
  { id: 'qwen-image-2.1-edit', label: 'Qwen-Image 2.1 Edit', backend: 'mflux' },
  { id: 'qwen-image-2.1-edit-comfyui', label: 'Qwen-Image 2.1 Edit', backend: 'comfyui' },
  { id: 'flux3-klein-edit-comfyui', label: 'FLUX.3 Klein Edit', backend: 'comfyui' },
] as const satisfies readonly { id: string; label: string; backend: ImageBackendKind }[]
export type EditModel = (typeof EDIT_MODELS)[number]['id']
/** The edit models one backend runs. */
export type EditModelOn<B extends ImageBackendKind> = Extract<
  (typeof EDIT_MODELS)[number],
  { backend: B }
>['id']

export const findEditModel = (id: unknown) => EDIT_MODELS.find((m) => m.id === id)

/** The edit models on the backends that can run here. */
export const editModelsHere = (backends: readonly ImageBackendKind[]) =>
  EDIT_MODELS.filter((m) => backends.includes(m.backend))
