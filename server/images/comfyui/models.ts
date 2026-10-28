import type { EditModelOn } from '../editModels.ts'
import type { Upscaler } from '../upscalers.ts'

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
  /** Fills its workflow's `$cfg`: real CFG (two passes a step) above 1. Only for a workflow that has one. */
  cfg?: number
  /** For each loader placeholder (`$unet`, `$clip`, `$vae`): its model folder and file patterns. */
  files: Record<string, { folder: string; patterns: RegExp[] }>
}

const QWEN_IMAGE_2_1_CLIP = { folder: 'text_encoders', patterns: [/^qwen3vl_8b.*\.safetensors$/] }
const QWEN_IMAGE_2_1_VAE = { folder: 'vae', patterns: [/^qwen_image_2\.1_vae.*\.safetensors$/] }
const FLUX2_VAE = { folder: 'vae', patterns: [/^flux2-vae.*\.safetensors$/] }
const FIBO_CLIP = {
  folder: 'text_encoders',
  patterns: [/^qwen3vl_4b_int8_convrot\.safetensors$/, /^qwen3vl_4b_bf16\.safetensors$/],
}
const FIBO_VAE = { folder: 'vae', patterns: [/^flux2-vae_fibo2\.safetensors$/] }

export const COMFYUI_MODELS: readonly ComfyModel[] = [
  {
    id: 'qwen-image-2.1',
    label: 'Qwen-Image 2.1',
    // As ComfyUI's template, and mflux's default here (docs/bench/steps).
    defaultSteps: 25,
    cfg: 1,
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
    cfg: 1,
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
    cfg: 1,
    files: {
      // Not flux-2-klein-base-4b, the undistilled model, which wants 20 steps at real CFG.
      unet: { folder: 'diffusion_models', patterns: [/^flux-2-klein-4b.*\.safetensors$/] },
      clip: {
        folder: 'text_encoders',
        patterns: [/^qwen_3_4b\.safetensors$/, /^qwen_3_4b_fp4_flux2/],
      },
      vae: FLUX2_VAE,
    },
  },
  {
    id: 'flux3-klein',
    label: 'FLUX.3 Klein',
    // BFL's default for the distilled checkpoint (ComfyUI's template runs 15), with no guidance.
    defaultSteps: 16,
    cfg: 1,
    files: {
      // Only the distilled `_sd_` files: the others are Klein Base, which wants 50 steps at CFG
      // 3.5. No nvfp4 build either: it needs a Blackwell card.
      unet: {
        folder: 'diffusion_models',
        patterns: [/^flux3_image_klein_sd_int8/, /^flux3_image_klein_sd_bf16/],
      },
      // BFL's own Qwen3-VL-4B builds; Krea 2's `qwen3vl_4b_fp8_scaled` isn't known to be the same.
      clip: {
        folder: 'text_encoders',
        patterns: [/^qwen3vl_4b_int8_convrot/, /^qwen3vl_4b_bf16/],
      },
      vae: FLUX2_VAE,
    },
  },
  {
    id: 'ming-image',
    label: 'Ming-Image 0.1 Design',
    // As ComfyUI's template, and mflux's default.
    defaultSteps: 12,
    files: {
      // Only Design: the `_layer_` files are Ming-Image-Layer, which splits a picture into layers.
      unet: {
        folder: 'diffusion_models',
        patterns: [/^ming_image_0\.1_design_int8/, /^ming_image_0\.1_design_bf16/],
      },
      // Its ~16B MoE encoder (Ling-mini 2.0): w4a8 first (12 GB): int8 is 18 GB, more than the PC's RAM.
      clip: {
        folder: 'text_encoders',
        patterns: [
          /^ming_image_0\.1_ling_mini_2\.0_w4a8/,
          /^ming_image_0\.1_ling_mini_2\.0_int8/,
          /^ming_image_0\.1_ling_mini_2\.0_bf16/,
        ],
      },
      vae: { folder: 'vae', patterns: [/^ming_image_vae/] },
    },
  },
  {
    id: 'moss-image',
    label: 'MOSS-Image',
    // As ComfyUI's template, at real CFG (two passes a step).
    defaultSteps: 25,
    cfg: 2.5,
    files: {
      // Only the instruction-tuned `_sft_` files: `_base_` is the checkpoint for fine-tuning.
      unet: {
        folder: 'diffusion_models',
        patterns: [/^moss_image_sft_int8/, /^moss_image_sft_bf16/],
      },
      clip: {
        folder: 'text_encoders',
        patterns: [/^qwen3\.5_9b_w4a8/, /^qwen3\.5_9b_int8/, /^qwen3\.5_9b_bf16/],
      },
      vae: { folder: 'vae', patterns: [/^flux2-vae_small/, /^flux2-vae\.safetensors$/] },
    },
  },
  {
    id: 'fibo-2.0',
    label: 'FIBO 2.0 Dev',
    defaultSteps: 50,
    cfg: 5,
    files: {
      unet: {
        folder: 'diffusion_models',
        patterns: [
          /^fibo2_dev_int8_convrot\.safetensors$/,
          /^fibo2_dev_bf16\.safetensors$/,
        ],
      },
      clip: FIBO_CLIP,
      vae: FIBO_VAE,
    },
  },
  {
    // Bria's Edit Turbo checkpoint as a generator (Dev distilled to 4 steps, no guidance), as on mflux.
    id: 'fibo-2.0-turbo',
    label: 'FIBO 2.0 Turbo',
    defaultSteps: 4,
    stepChoices: [4],
    cfg: 1,
    files: {
      unet: {
        folder: 'diffusion_models',
        patterns: [
          /^fibo2_edit_turbo_int8_convrot\.safetensors$/,
          /^fibo2_edit_turbo_bf16\.safetensors$/,
        ],
      },
      clip: FIBO_CLIP,
      vae: FIBO_VAE,
    },
  },
  {
    id: 'z-image-turbo',
    label: 'Z-Image Turbo',
    defaultSteps: 8,
    cfg: 1,
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

/**
 * An edit model as ComfyUI runs it (ADR 0021): an Image Model's own files and steps, in an edit
 * workflow (`workflows/<workflow>.json`), so nothing more is downloaded.
 */
export interface ComfyEditor {
  id: EditModelOn<'comfyui'>
  /** The Image Model whose files and steps it uses (`COMFYUI_MODELS`). */
  model: string
  workflow: string
  /** Files or sampler settings that differ from the Image Model (`model`). */
  files?: Pick<ComfyModel, 'label' | 'files'>
  steps?: number
  cfg?: number
  /**
   * Its prompt (`prompts/images/<prompt>.md`, and `<prompt>-whole` with nothing painted), told
   * where to paint by boxes (`maskBoxes`); none for the instruction as typed.
   */
  prompt?: string
}

export const COMFYUI_EDITORS: readonly ComfyEditor[] = [
  { id: 'qwen-image-2.1-edit', model: 'qwen-image-2.1', workflow: 'qwen-image-2.1-edit' },
  {
    id: 'flux3-klein-edit',
    model: 'flux3-klein',
    workflow: 'flux3-klein-edit',
    prompt: 'flux3-edit',
  },
  {
    id: 'fibo-2.0-dev-edit',
    model: 'fibo-2.0',
    workflow: 'fibo-2.0-edit',
  },
  {
    id: 'fibo-2.0-edit-turbo',
    model: 'fibo-2.0',
    workflow: 'fibo-2.0-edit-turbo',
    files: {
      label: 'FIBO 2.0 Edit Turbo',
      files: {
        unet: {
          folder: 'diffusion_models',
          patterns: [
            /^fibo2_edit_turbo_int8_convrot\.safetensors$/,
            /^fibo2_edit_turbo_bf16\.safetensors$/,
          ],
        },
        clip: FIBO_CLIP,
        vae: FIBO_VAE,
      },
    },
    steps: 4,
    cfg: 1,
  },
]

export function findComfyEditor(id: string): ComfyEditor | undefined {
  return COMFYUI_EDITORS.find((e) => e.id === id)
}
