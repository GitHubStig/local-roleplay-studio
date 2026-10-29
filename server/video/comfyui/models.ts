import type { ModelFiles } from '../../comfyui/files.ts'

/**
 * A video model as ComfyUI runs it: its workflow in API format (`workflows/<workflow>.json`, with
 * `$placeholders`; for now each guides its pictures in at the clip's ends as LTX 2.5's does, by
 * `firstGuide` and `lastGuide` nodes, see `withoutEnds`), and for each loader the files it can use,
 * best first, as each machine has its own build.
 */
export interface ComfyVideoModel extends ModelFiles {
  id: string
  workflow: string
}

export const COMFYUI_VIDEO_MODELS: readonly ComfyVideoModel[] = [
  {
    id: 'ltx-2.5',
    label: 'LTX 2.5',
    workflow: 'ltx-2.5',
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
]

export const DEFAULT_VIDEO_MODEL = COMFYUI_VIDEO_MODELS[0].id

export const findComfyVideoModel = (id: string) => COMFYUI_VIDEO_MODELS.find((m) => m.id === id)
