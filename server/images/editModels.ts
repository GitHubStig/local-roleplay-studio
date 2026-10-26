import type { ImageBackendKind } from './imageModels.ts'

/**
 * The edit models (ADR 0021): each repaints a picture as told, in an area painted over it, whatever
 * model rendered the picture. Each is known by its name, wherever it runs (ADR 0022): the kinds of
 * backend that run it are listed, and an edit goes where Settings send edits. Settings offers
 * those a kind of backend here runs (`editModelsHere`).
 */
export const EDIT_MODELS = [
  { id: 'qwen-image-2.1-edit', label: 'Qwen-Image 2.1 Edit', backends: ['mflux', 'comfyui'] },
  { id: 'flux3-klein-edit', label: 'FLUX.3 Klein Edit', backends: ['comfyui'] },
] as const satisfies readonly {
  id: string
  label: string
  backends: readonly ImageBackendKind[]
}[]
export type EditModel = (typeof EDIT_MODELS)[number]['id']
/** The edit models one kind of backend runs. */
export type EditModelOn<B extends ImageBackendKind> = keyof {
  [M in (typeof EDIT_MODELS)[number] as B extends M['backends'][number] ? M['id'] : never]: M
}

export const findEditModel = (id: unknown) => EDIT_MODELS.find((m) => m.id === id)

/** Whether a kind of backend runs edit model `id`. */
export const editModelOn = (id: unknown, backend: ImageBackendKind): boolean =>
  !!findEditModel(id)?.backends.some((b) => b === backend)

/** The edit models a kind of backend that can run here runs. */
export const editModelsHere = (backends: readonly ImageBackendKind[]) =>
  EDIT_MODELS.filter((m) => m.backends.some((b) => backends.includes(b)))
