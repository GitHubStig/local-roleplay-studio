/** An mflux Image Model the player can choose, and how to invoke it. */
/** An Image Model as mflux runs it. */
export interface MfluxModel {
  id: string
  label: string
  /** The `mflux-generate-*` executable. */
  command: string
  /** Value passed to `--model`: a built-in name or a Hugging Face repo. */
  model: string
  /** Value passed to `--base-model` when `model` is a repo mflux can't classify by name. */
  baseModel?: string
  /** Weights already quantized, so `--quantize` must not be passed. */
  preQuantized?: boolean
  /** Steps to use when the model is picked: mflux's own default, unless fewer look as good. */
  defaultSteps: number
  /** Takes mflux's step cache (`--step-cache-ratio`): it skips the steps that change least. */
  stepCache?: boolean
  /** Takes `--compute-precision float16`: faster on M1 and M2 Macs, the same on M4 and M5. */
  float16?: boolean
  /** A few-step mode the player can switch on: a distilling LoRA with its own scheduler. */
  fast?: FastMode
}

/** A turbo LoRA and how it must run: with this scheduler, at exactly this many steps. */
export interface FastMode {
  /** For `--lora`: a local file, or a Hugging Face `repo:file` fetched on first use. */
  lora: string
  scheduler: string
  steps: number
}

export const MFLUX_MODELS: readonly MfluxModel[] = [
  {
    id: 'flux2-klein-4b',
    label: 'FLUX.2 Klein 4B',
    command: 'mflux-generate-flux2',
    model: 'flux2-klein-4b',
    defaultSteps: 4,
    float16: true,
  },
  {
    id: 'flux2-klein-9b',
    label: 'FLUX.2 Klein 9B',
    command: 'mflux-generate-flux2',
    model: 'flux2-klein-9b',
    defaultSteps: 4,
    float16: true,
  },
  {
    id: 'z-image-turbo',
    label: 'Z-Image Turbo (4-bit)',
    command: 'mflux-generate-z-image-turbo',
    model: 'filipstrand/Z-Image-Turbo-mflux-4bit',
    baseModel: 'z-image-turbo',
    preQuantized: true,
    defaultSteps: 9,
    float16: true,
  },
  {
    id: 'krea-2',
    label: 'Krea 2',
    command: 'mflux-generate-krea2',
    model: 'krea-2',
    defaultSteps: 8,
  },
  {
    id: 'ernie-image-turbo',
    label: 'ERNIE-Image Turbo',
    command: 'mflux-generate-ernie-image-turbo',
    model: 'ernie-image-turbo',
    defaultSteps: 8,
  },
  {
    id: 'boogu-image-turbo',
    label: 'Boogu Image Turbo',
    command: 'mflux-generate-boogu',
    model: 'boogu-image-turbo',
    defaultSteps: 4,
  },
  {
    id: 'qwen-image-2.1',
    label: 'Qwen-Image 2.1',
    command: 'mflux-generate-qwen-2.1',
    model: 'qwen-image-2.1',
    // mflux defaults to 40; 25 looks just as good at 512 px and is much faster.
    defaultSteps: 25,
    stepCache: true,
    float16: true,
    // Viggle's turbo LoRA (1.3 GB, Qwen research license): about 3.4x faster, a little smoother.
    fast: {
      lora:
        'Viggle/Qwen-Image-2.1-viggle-turbo:Qwen-Image-2.1-viggle-turbo-v0.3-6step-lora-r256.safetensors',
      scheduler: 'viggle_turbo',
      steps: 6,
    },
  },
]

/** The SeedVR2 upscalers mflux offers; the model name is also the id. */
export const UPSCALERS = [
  { id: 'seedvr2-7b', label: 'SeedVR2 7B (sharper)' },
  { id: 'seedvr2-3b', label: 'SeedVR2 3B (a little faster)' },
] as const
export type Upscaler = (typeof UPSCALERS)[number]['id']

export function findMfluxModel(id: string): MfluxModel | undefined {
  return MFLUX_MODELS.find((m) => m.id === id)
}
