import { EDIT_MODELS, type ImageBackendKind } from '../../shared/images.ts'

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
