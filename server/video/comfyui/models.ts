import type { ModelFiles } from '../../comfyui/files.ts'
import type { ClipSize } from '../videoGenerator.ts'

/**
 * A video model as ComfyUI runs it: its workflow in API format (`workflows/<workflow>.json`, with
 * `$placeholders`, the pictures loaded by `firstImage` and `lastImage` nodes, see `withoutEnds`),
 * for each loader the files it can use, best first, as each machine has its own build, and the
 * shape of clip it makes.
 */
export interface ComfyVideoModel extends ModelFiles {
  id: string
  workflow: string
  /** Frames per second it's made at. */
  fps: number
  /** The frame count it takes nearest a length (each model has its own grid). */
  frames(seconds: number): number
  /** About how many pixels a frame has at each size, in the picture's shape, each side a multiple of `multiple`. */
  pixels: Record<ClipSize, number>
  /** The size it makes unless Settings say otherwise. */
  size: ClipSize
  /**
   * Its longest clip at each size, in seconds, as far as measured on a 12 GB card: a longer one
   * ran out of its memory (docs/research/video-models.md).
   */
  longest: Record<ClipSize, number>
  multiple: number
  /** It makes its own sound (Wan 2.2 makes none). */
  sound: boolean
}

export const COMFYUI_VIDEO_MODELS: readonly ComfyVideoModel[] = [
  {
    id: 'ltx-2.5',
    label: 'LTX 2.5',
    workflow: 'ltx-2.5',
    fps: 24,
    // 8n + 1 (5 s is 121).
    frames: (seconds) => Math.max(1, Math.round((seconds * 24) / 8)) * 8 + 1,
    // Its own size, as measured on the PC, by default (docs/research/video-models.md).
    pixels: { small: 400_000, large: 1280 * 704 },
    size: 'large',
    longest: { small: 10, large: 10 },
    multiple: 32,
    sound: true,
    // As ComfyUI's LTX 2.5 template downloads them (int8 on the PC, 2026-10-29).
    files: {
      unet: {
        folder: 'diffusion_models',
        patterns: [/^ltx-2\.5-22b-distilled-transformer.*\.safetensors$/],
      },
      clip: {
        folder: 'text_encoders',
        patterns: [/^gemma4-12b-with-proj-ltx-2\.5.*\.safetensors$/],
      },
      vae: { folder: 'vae', patterns: [/^ltx-2\.5-video-vae.*\.safetensors$/] },
      audioVae: { folder: 'vae', patterns: [/^ltx-2\.5-audio-vae.*\.safetensors$/] },
    },
  },
  {
    id: 'wan-2.2',
    label: 'Wan 2.2 14B',
    workflow: 'wan-2.2',
    fps: 16,
    // 4n + 1 (5 s is 81).
    frames: (seconds) => Math.max(1, Math.round((seconds * 16) / 4)) * 4 + 1,
    // The template's 640×640, for a 12 GB card, by default; 720p's pixels at its trained size.
    pixels: { small: 640 * 640, large: 1280 * 720 },
    size: 'small',
    // At 720p's pixels, 8 s and 10 s ran out of the 4070's memory in the second sampler (2026-11-01).
    longest: { small: 10, large: 5 },
    multiple: 16,
    sound: false,
    // As ComfyUI's Wan 2.2 first–last-frame template downloads them (2026-10-31, the PC).
    files: {
      unetHigh: {
        folder: 'diffusion_models',
        patterns: [/^wan2\.2_i2v_high_noise_14B.*\.safetensors$/],
      },
      unetLow: {
        folder: 'diffusion_models',
        patterns: [/^wan2\.2_i2v_low_noise_14B.*\.safetensors$/],
      },
      loraHigh: {
        folder: 'loras',
        patterns: [/^wan2\.2_i2v_lightx2v_4steps_lora.*_high_noise\.safetensors$/],
      },
      loraLow: {
        folder: 'loras',
        patterns: [/^wan2\.2_i2v_lightx2v_4steps_lora.*_low_noise\.safetensors$/],
      },
      clip: { folder: 'text_encoders', patterns: [/^umt5_xxl.*\.safetensors$/] },
      vae: { folder: 'vae', patterns: [/^wan_2\.1_vae.*\.safetensors$/] },
    },
  },
  {
    id: 'minimax-h3',
    label: 'MiniMax H3 (turbo)',
    workflow: 'minimax-h3',
    fps: 24,
    // 17k + 5, rounded up, as the template does (5 s is 124).
    frames: (seconds) => {
      const n = Math.max(5, Math.round(seconds * 24))
      return n + ((5 - (n % 17) + 17) % 17)
    },
    // The template's 0.4 megapixels by default; 768p at its trained size.
    pixels: { small: 400_000, large: 1152 * 768 },
    size: 'small',
    longest: { small: 10, large: 10 },
    multiple: 32,
    sound: true,
    // As ComfyUI's MiniMax H3 image-to-video template downloads them (2026-10-31, both machines).
    files: {
      unet: { folder: 'diffusion_models', patterns: [/^minimax_h3_fl2va.*\.safetensors$/] },
      lora: { folder: 'loras', patterns: [/^minimax_h3_fl2v_turbo_8step.*\.safetensors$/] },
      clip: { folder: 'text_encoders', patterns: [/^qwen3vl_32b_minimax_h3.*\.safetensors$/] },
      // The Mac has an fp16 video VAE as well as the int8 one.
      vae: {
        folder: 'vae',
        patterns: [
          /^minimax_h3_video_vae_fp16\.safetensors$/,
          /^minimax_h3_video_vae.*\.safetensors$/,
        ],
      },
      audioVae: { folder: 'vae', patterns: [/^minimax_h3_audio_vae.*\.safetensors$/] },
    },
  },
]

export const DEFAULT_VIDEO_MODEL = COMFYUI_VIDEO_MODELS[0].id

export const findComfyVideoModel = (id: string) => COMFYUI_VIDEO_MODELS.find((m) => m.id === id)

/**
 * A clip's size for a picture's: its shape, with about as many pixels as the model makes at `size`
 * (its own, unless given), each side a multiple of what it needs.
 */
export function clipSize(
  model: Pick<ComfyVideoModel, 'pixels' | 'multiple' | 'size'>,
  width: number,
  height: number,
  size: ClipSize = model.size,
): { width: number; height: number } {
  const scale = Math.sqrt(model.pixels[size] / (width * height))
  const m = model.multiple
  const side = (n: number) => Math.max(m, Math.round((n * scale) / m) * m)
  return { width: side(width), height: side(height) }
}
