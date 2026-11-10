/**
 * The extras beyond the Text Model, and whether each can run. Shared by the server and the web
 * app: types and plain values only.
 */

/**
 * The extras beyond the Text Model, each needing its own backend: pictures (mflux, or a ComfyUI
 * server), upscaling (SeedVR2 through mflux), editing pictures (Qwen through mflux or ComfyUI, and
 * FLUX.3 through ComfyUI), voices (the mlx-audio service), 3D (SHARP, TripoSplat, LiTo), and the
 * Compare dialog's style scores (CSD and CLIP). Which of them this machine can run is worked out
 * once at startup (`detectFeatures`); Settings can switch off any that can. Pictures are also
 * available wherever Settings choose ComfyUI (`app.ts`), which this can't know at startup.
 */
export const FEATURES = [
  'images',
  'upscale',
  'edits',
  'voices',
  'scenes',
  'figures',
  'lito',
  'style',
  'video',
] as const

export type Feature = (typeof FEATURES)[number]

/** Whether a Feature can run here, and if not, why not (for Settings to say). */
export interface Availability {
  available: boolean
  reason?: string
}

export type Availabilities = Record<Feature, Availability>
