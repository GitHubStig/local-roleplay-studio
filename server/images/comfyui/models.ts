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
  /** The only steps it renders at, when its workflow fixes them; any count otherwise. */
  stepChoices?: number[]
  /** For each loader placeholder (`$unet`, `$clip`, `$vae`): its model folder and file patterns. */
  files: Record<string, { folder: string; patterns: RegExp[] }>
}

const QWEN_IMAGE_2_1_CLIP = { folder: 'text_encoders', patterns: [/^qwen3vl_8b.*\.safetensors$/] }
const QWEN_IMAGE_2_1_VAE = { folder: 'vae', patterns: [/^qwen_image_2\.1_vae.*\.safetensors$/] }

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
          /^qwen_image_2\.1_(?!vae|turbo).*\.safetensors$/,
        ],
      },
      clip: QWEN_IMAGE_2_1_CLIP,
      vae: QWEN_IMAGE_2_1_VAE,
    },
  },
  {
    id: 'qwen-image-2.1-turbo',
    label: 'Qwen-Image 2.1 Turbo',
    // Qwen's distilled DiT on the template's fixed 8 sigmas (not mflux's Viggle LoRA, which runs 6).
    defaultSteps: 8,
    stepChoices: [8],
    files: {
      unet: {
        folder: 'diffusion_models',
        patterns: [
          /^qwen_image_2\.1_turbo_int8/,
          /^qwen_image_2\.1_turbo_fp8/,
          /^qwen_image_2\.1_turbo.*\.safetensors$/,
        ],
      },
      clip: QWEN_IMAGE_2_1_CLIP,
      vae: QWEN_IMAGE_2_1_VAE,
    },
  },
  {
    id: 'flux2-klein-4b',
    label: 'FLUX.2 Klein 4B',
    defaultSteps: 4,
    files: {
      // Not flux-2-klein-base-4b, the undistilled model, which wants 20 steps at real CFG.
      unet: { folder: 'diffusion_models', patterns: [/^flux-2-klein-4b.*\.safetensors$/] },
      clip: {
        folder: 'text_encoders',
        patterns: [/^qwen_3_4b\.safetensors$/, /^qwen_3_4b_fp4_flux2/],
      },
      vae: { folder: 'vae', patterns: [/^flux2-vae.*\.safetensors$/] },
    },
  },
  {
    id: 'z-image-turbo',
    label: 'Z-Image Turbo',
    defaultSteps: 8,
    files: {
      unet: {
        folder: 'diffusion_models',
        patterns: [/^z_image_turbo_int8/, /^z_image_turbo_bf16/, /^z_image_turbo_fp8/],
      },
      // The same Qwen3 4B as Klein's (the bf16 file is identical in both of Comfy-Org's repos).
      clip: {
        folder: 'text_encoders',
        patterns: [/^qwen_3_4b_fp8_mixed/, /^qwen_3_4b\.safetensors$/],
      },
      vae: { folder: 'vae', patterns: [/^ae\.safetensors$/] },
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
