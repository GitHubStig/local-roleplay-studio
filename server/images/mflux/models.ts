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
  /** mflux sets the steps itself (from a preset) and ignores `--steps`, so none are passed. */
  fixedSteps?: boolean
  /** Arguments passed on every render, after the rest. */
  args?: readonly string[]
  /**
   * Straight double quotes in the prompt become curly ones. FIBO's VLM copies a quoted line ("Yo!")
   * into its JSON caption unescaped, which breaks the JSON whatever the seed.
   */
  curlyQuotes?: boolean
  /** Takes mflux's step cache (`--step-cache-ratio`): it skips the steps that change least. */
  stepCache?: boolean
  /** Takes `--compute-precision float16`: faster on M1 and M2 Macs, the same on M4 and M5. */
  float16?: boolean
  /** A few-step mode the player can switch on: a distilling LoRA with its own scheduler. */
  fast?: FastMode
}

/** A faster way to render (a turbo LoRA with its scheduler, a turbo preset), at exactly these steps. */
export interface FastMode {
  /** The arguments that switch it on. A `--lora` takes a local file or a Hugging Face `repo:file`. */
  args: readonly string[]
  steps: number
  /** What it does, for Settings: follows "Renders in N steps". */
  note: string
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
      args: [
        '--scheduler',
        'viggle_turbo',
        '--lora',
        'Viggle/Qwen-Image-2.1-viggle-turbo:Qwen-Image-2.1-viggle-turbo-v0.3-6step-lora-r256.safetensors',
        '1.0',
      ],
      steps: 6,
      note:
        'with a turbo LoRA (downloaded the first time, 1.3 GB): about 3× faster, a little smoother and less painterly.',
    },
  },
  {
    id: 'ming-image',
    label: 'Ming-Image 0.1 Design',
    command: 'mflux-generate-ming',
    // mflux's saved copy as its README recommends: the DiT at 8 bits (4 breaks the lettering), the
    // ~16B MoE text encoder at 5, which still matches the original (19 GB, against 53 GB unsaved).
    model: 'joeynyc/Ming-Image-0.1-Design-mflux-q8-te5',
    baseModel: 'ming-image-design',
    preQuantized: true,
    defaultSteps: 12,
    // It renders RGBA; pictures are RGB everywhere else (Qwen-Image 2.1 edits read alpha as a mask).
    args: ['--flatten-alpha'],
  },
  {
    id: 'fibo-1.5',
    label: 'FIBO 1.5 (8-bit)',
    command: 'mflux-generate-fibo',
    // mflux-community's saved 8-bit copy (15 GB). Bria's distilled FIBO, so it's read as FIBO and
    // given its own settings: mflux would run FIBO's 50 steps at guidance 5, it wants 4–6 at 1.
    // A plain prompt is first written out as FIBO's JSON caption by its own VLM (`briaai/FIBO-vlm`,
    // 9 GB, fetched on first use), which is then freed before rendering.
    model: 'mflux-community/fibo-1-5-mflux-q8',
    baseModel: 'fibo',
    preQuantized: true,
    defaultSteps: 6,
    args: ['--guidance', '1.0'],
    curlyQuotes: true,
  },
  {
    id: 'ideogram-4',
    label: 'Ideogram 4 (8-bit)',
    command: 'mflux-generate-ideogram4',
    // mflux's saved 8-bit copy of the FP8 checkpoint: the same size, without dequantizing FP8 at
    // every step. Gated: accept its terms on Hugging Face and sign in (`hf auth login`) first.
    model: 'mflux-community/ideogram-4-mflux-q8',
    baseModel: 'ideogram-4-fp8',
    preQuantized: true,
    // A preset sets the steps and guidance schedule; mflux's default is V4_DEFAULT_20.
    defaultSteps: 20,
    fixedSteps: true,
    fast: {
      args: ['--preset', 'V4_TURBO_12'],
      steps: 12,
      note:
        "with Ideogram's turbo preset instead of its default 20: its own schedule, a little different.",
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
