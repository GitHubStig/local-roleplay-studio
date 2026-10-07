import type { Upscaler } from '../mflux/models.ts'

/**
 * An Image Model as ComfyUI runs it: a workflow in API format (`workflows/<id>.json`, with
 * `$placeholders`), and for each of its loaders the files it can use. Files are named by pattern,
 * best first, as each machine has its own build (int8 on the owner's Mac; fp8 suits an NVIDIA card),
 * and the first one ComfyUI has installed is used. Only ComfyUI's built-in nodes, so a fresh
 * install runs them on either machine.
 */
export interface ComfyModel {
  id: string
  label: string
  defaultSteps: number
  /** For each loader placeholder (`$unet`, `$clip`, `$vae`): its model folder and file patterns. */
  files: Record<string, { folder: string; patterns: RegExp[] }>
}

export const COMFYUI_MODELS: readonly ComfyModel[] = [
  {
    id: 'qwen-image-2.1',
    label: 'Qwen-Image 2.1',
    // As ComfyUI's template, and mflux's default here (docs/bench/steps).
    defaultSteps: 25,
    files: {
      unet: {
        folder: 'diffusion_models',
        patterns: [
          /^qwen_image_2\.1_int8/,
          /^qwen_image_2\.1_fp8/,
          /^qwen_image_2\.1_(?!vae).*\.safetensors$/,
        ],
      },
      clip: { folder: 'text_encoders', patterns: [/^qwen3vl_8b.*\.safetensors$/] },
      vae: { folder: 'vae', patterns: [/^qwen_image_2\.1_vae.*\.safetensors$/] },
    },
  },
]

export function findComfyModel(id: string): ComfyModel | undefined {
  return COMFYUI_MODELS.find((m) => m.id === id)
}

/**
 * SeedVR2 as ComfyUI runs it (built in since 0.39): one workflow (`workflows/seedvr2.json`) for
 * both sizes, with Comfy-Org's repack of the weights (`Comfy-Org/SeedVR2`; mflux's own files don't
 * load in ComfyUI). The "sharp" 7B is a different model, so it's never picked for the plain one.
 */
export interface ComfyUpscaler {
  id: Upscaler
  label: string
  /** For each loader placeholder (`$unet`, `$vae`): its model folder and file patterns. */
  files: ComfyModel['files']
}

const SEEDVR2_VAE = { folder: 'vae', patterns: [/^seedvr2_ema_vae.*\.safetensors$/, /^ema_vae/] }

export const COMFYUI_UPSCALERS: readonly ComfyUpscaler[] = (['7b', '3b'] as const).map((size) => ({
  id: `seedvr2-${size}`,
  label: `SeedVR2 ${size.toUpperCase()}`,
  files: {
    unet: {
      folder: 'diffusion_models',
      patterns: [
        new RegExp(`^seedvr2_${size}_int8`),
        new RegExp(`^seedvr2_${size}_fp8`),
        new RegExp(`^seedvr2_${size}_(?!sharp).*\\.safetensors$`),
      ],
    },
    vae: SEEDVR2_VAE,
  },
}))

export function findComfyUpscaler(id: string): ComfyUpscaler | undefined {
  return COMFYUI_UPSCALERS.find((u) => u.id === id)
}
