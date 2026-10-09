import { COMFYUI_MODELS } from './comfyui/models.ts'
import { MFLUX_MODELS } from './mflux/models.ts'

/**
 * Where pictures are made: mflux (Apple Silicon Macs) or a ComfyUI server (any machine; Windows
 * with an NVIDIA card). Each has its own Image Models (`mflux/models.ts`, `comfyui/models.ts`).
 */
export const IMAGE_BACKENDS = ['mflux', 'comfyui'] as const
export type ImageBackendKind = (typeof IMAGE_BACKENDS)[number]

export const IMAGE_BACKEND_NAMES: Record<ImageBackendKind, string> = {
  mflux: 'mflux',
  comfyui: 'ComfyUI',
}

export { COMFYUI_URL } from '../comfyui/client.ts'

/** An Image Model as Settings and the screens see it, whichever backend runs it. */
export interface ImageModelOption {
  id: string
  label: string
  defaultSteps: number
  /** Takes the step cache (mflux). */
  stepCache: boolean
  /** The steps its fast mode runs at; absent when it has none (mflux). */
  fastSteps?: number
  /** Can be quantized to 8 or 4 bits as it loads (mflux). */
  quantize: boolean
  /** Takes float16 compute (mflux). */
  float16: boolean
}

export function imageModelsOf(backend: ImageBackendKind): ImageModelOption[] {
  return backend === 'comfyui'
    ? COMFYUI_MODELS.map(({ id, label, defaultSteps }) => ({
      id,
      label,
      defaultSteps,
      stepCache: false,
      quantize: false,
      float16: false,
    }))
    : MFLUX_MODELS.map(({ id, label, defaultSteps, stepCache, fast, preQuantized, float16 }) => ({
      id,
      label,
      defaultSteps,
      stepCache: !!stepCache,
      ...(fast && { fastSteps: fast.steps }),
      quantize: !preQuantized,
      float16: !!float16,
    }))
}

export const findImageModel = (backend: ImageBackendKind, id: string) =>
  imageModelsOf(backend).find((m) => m.id === id)
