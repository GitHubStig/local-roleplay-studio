import { COMFYUI_MODELS } from './comfyui/models.ts'
import { MFLUX_MODELS } from './mflux/models.ts'
import {
  IMAGE_BACKENDS,
  type ImageBackendKind,
  type ImageModelOption,
} from '../../shared/images.ts'

export { COMFYUI_URL } from '../comfyui/client.ts'

export function imageModelsOf(backend: ImageBackendKind): ImageModelOption[] {
  return backend === 'comfyui'
    ? COMFYUI_MODELS.map(({ id, label, defaultSteps, stepChoices }) => ({
      id,
      label,
      defaultSteps,
      ...(stepChoices && { stepChoices }),
      stepCache: false,
      quantize: false,
      float16: false,
    }))
    : MFLUX_MODELS.map((
      { id, label, defaultSteps, stepPresets, stepCache, preQuantized, float16 },
    ) => ({
      id,
      label,
      defaultSteps,
      ...(stepPresets && { stepChoices: stepPresets.map((p) => p.steps) }),
      stepCache: !!stepCache,
      quantize: !preQuantized,
      float16: !!float16,
    }))
}

export const findImageModel = (backend: ImageBackendKind, id: string) =>
  imageModelsOf(backend).find((m) => m.id === id)

/**
 * Image Model `id` on any backend (ADR 0022: the same name is the same model): `prefer`'s if it
 * has it, else the first backend's that does.
 */
export const anyImageModel = (id: string, prefer?: ImageBackendKind) =>
  (prefer && findImageModel(prefer, id)) ??
    IMAGE_BACKENDS.map((b) => findImageModel(b, id)).find(Boolean)
