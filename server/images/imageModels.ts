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

/** ComfyUI's own default address. */
export const COMFYUI_URL = 'http://127.0.0.1:8188'

/** An Image Model as Settings and the screens see it, whichever backend runs it. */
export interface ImageModelOption {
  id: string
  label: string
  defaultSteps: number
  /** Takes the step cache (mflux). */
  stepCache: boolean
  /** The steps its fast mode runs at; absent when it has none (mflux). */
  fastSteps?: number
  /** Can use a saved 8- or 4-bit copy (mflux). */
  quantize: boolean
}

export function imageModelsOf(backend: ImageBackendKind): ImageModelOption[] {
  return backend === 'comfyui'
    ? COMFYUI_MODELS.map(({ id, label, defaultSteps }) => ({
      id,
      label,
      defaultSteps,
      stepCache: false,
      quantize: false,
    }))
    : MFLUX_MODELS.map(({ id, label, defaultSteps, stepCache, fast, preQuantized }) => ({
      id,
      label,
      defaultSteps,
      stepCache: !!stepCache,
      ...(fast && { fastSteps: fast.steps }),
      quantize: !preQuantized,
    }))
}

export const findImageModel = (backend: ImageBackendKind, id: string) =>
  imageModelsOf(backend).find((m) => m.id === id)
