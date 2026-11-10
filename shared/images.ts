/**
 * Image Prompts and Image Models. Shared by the server and the web app: types and plain values
 * only.
 */

/**
 * The whole state of a Session at one Frame: one paragraph in the order of `PROMPT_ORDER`, details
 * within a sentence separated by commas or semicolons. Nine sentences in a Chain; in a Storyboard
 * or Roleplay, one identity per person shown, the Frame's seven sentences, then the style.
 */
export type ImagePrompt = string

/** An Image Model as Settings and the screens see it, whichever backend runs it. */
export interface ImageModelOption {
  id: string
  label: string
  defaultSteps: number
  /** Takes the step cache (mflux). */
  stepCache: boolean
  /** The only steps it renders at, when it has presets (mflux) or a fixed schedule; any otherwise. */
  stepChoices?: number[]
  /** Can be quantized to 8 or 4 bits as it loads (mflux). */
  quantize: boolean
  /** Takes float16 compute (mflux). */
  float16: boolean
}

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
