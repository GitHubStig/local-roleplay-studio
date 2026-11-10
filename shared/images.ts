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

/**
 * The SeedVR2 upscalers, whichever backend runs them: mflux takes the id as the model's name, and
 * ComfyUI has its own files for each (`comfyui/models.ts`).
 */
export const UPSCALERS = [
  { id: 'seedvr2-7b', label: 'SeedVR2 7B (sharper)' },
  { id: 'seedvr2-3b', label: 'SeedVR2 3B (a little faster)' },
] as const

export type Upscaler = (typeof UPSCALERS)[number]['id']

/**
 * The edit models (ADR 0021): each repaints a picture as told, in an area painted over it, whatever
 * model rendered the picture. Each is known by its name, wherever it runs (ADR 0022): the kinds of
 * backend that run it are listed, and an edit goes where Settings send edits. Settings offers
 * those a kind of backend here runs (`editModelsHere`).
 */
export const EDIT_MODELS = [
  {
    id: 'qwen-image-2.1-edit',
    label: 'Qwen-Image 2.1 Edit',
    backends: ['mflux', 'comfyui'],
    prompting: 'Takes an instruction: say what to paint there, terse or described.',
  },
  {
    id: 'qwen-image-2.1-turbo-edit',
    label: 'Qwen-Image 2.1 Turbo Edit',
    backends: ['mflux', 'comfyui'],
    prompting: 'Takes an instruction: say what to paint there, terse or described.',
  },
  {
    id: 'flux3-klein-edit',
    label: 'FLUX.3 Klein Edit',
    backends: ['mflux', 'comfyui'],
    prompting:
      'Wants what should be there described, as a caption of the result, not a command. It draws it the size of the area painted. With several areas painted, say which goes where.',
  },
  {
    id: 'fibo-2.0-dev-edit',
    label: 'FIBO 2.0 Dev Edit',
    backends: ['mflux', 'comfyui'],
    prompting: 'Describe only what goes in the painted area: “keep the rest” can add things.',
  },
  {
    id: 'fibo-2.0-edit-turbo',
    label: 'FIBO 2.0 Edit Turbo',
    backends: ['mflux', 'comfyui'],
    prompting: 'Describe only what goes in the painted area: “keep the rest” can add things.',
  },
] as const satisfies readonly {
  id: string
  label: string
  backends: readonly ImageBackendKind[]
  /** How it likes to be told, shown under the instruction (research/image-models.md). */
  prompting: string
}[]
export type EditModel = (typeof EDIT_MODELS)[number]['id']
