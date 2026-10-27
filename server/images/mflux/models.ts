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
  /**
   * The only steps it renders at, each picked by its own arguments (a preset, or `--steps` itself);
   * Settings' steps choose one, and any other count renders at `defaultSteps`.
   */
  stepPresets?: readonly StepPreset[]
  /** Guidance (`--guidance`): real CFG at above 1 on a model that has it. mflux's own default if not given. */
  cfg?: number
  /** A LoRA passed as `--lora` on every render. */
  lora?: Lora
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
}

/**
 * A LoRA for mflux: a Hugging Face repo, a `repo:file.safetensors` in one, or a local file. A local
 * path starting `./` or `../` is from the repo's root, wherever the server was started.
 */
export interface Lora {
  path: string
  /** How strongly it applies; mflux's default is 1.0. */
  scale?: number
}

/** A step count a model renders at, and the arguments that choose it. */
export interface StepPreset {
  steps: number
  args: readonly string[]
}

export const MFLUX_MODELS: readonly MfluxModel[] = [
  {
    id: 'flux2-klein-4b',
    label: 'FLUX.2 Klein 4B',
    command: 'mflux-generate-flux2',
    model: 'mflux-community/flux2-klein-4b-mflux-bf16',
    baseModel: 'flux2-klein-4b',
    defaultSteps: 4,
    float16: true,
  },
  {
    id: 'flux2-klein-9b',
    label: 'FLUX.2 Klein 9B',
    command: 'mflux-generate-flux2',
    model: 'mflux-community/flux2-klein-9b-mflux-bf16',
    baseModel: 'flux2-klein-9b',
    defaultSteps: 4,
    float16: true,
  },
  {
    id: 'flux3-klein',
    label: 'FLUX.3 Klein',
    command: 'mflux-generate-flux3',
    // The distilled checkpoint: 16 steps, no guidance. mflux-community's bf16 copy (18.5 GB, fetched on
    // first use), not gated like Black Forest Labs' own repo, which mflux's `flux3-image-klein` names.
    model: 'mflux-community/flux-3-image-klein-mflux-bf16',
    baseModel: 'flux3-image-klein',
    defaultSteps: 16,
    float16: true,
  },
  {
    id: 'z-image-turbo',
    label: 'Z-Image Turbo (4-bit)',
    command: 'mflux-generate-z-image-turbo',
    model: 'mflux-community/z-image-turbo-mflux-q4',
    baseModel: 'z-image-turbo',
    preQuantized: true,
    defaultSteps: 9,
    float16: true,
  },
  {
    id: 'z-image',
    label: 'Z-Image (8-bit)',
    command: 'mflux-generate-z-image',
    // Z-Image Turbo's undistilled base: real guidance, so a slower, CFG-doubled step.
    // mflux-community's saved 8-bit copy (11 GB, against ~31 GB unsaved).
    model: 'mflux-community/z-image-base-mflux-q8',
    baseModel: 'z-image',
    preQuantized: true,
    // mflux defaults to 50; 30 looks as good (docs/models.md) and takes ~190 s, not ~300.
    defaultSteps: 30,
    float16: true,
    // mflux's guidance is 0 (no CFG) unless given; its README runs the base at 4.
    cfg: 4,
  },
  {
    id: 'krea-2',
    label: 'Krea 2',
    command: 'mflux-generate-krea2',
    model: 'mflux-community/krea-2-turbo-mflux-bf16',
    baseModel: 'krea-2',
    defaultSteps: 8,
  },
  {
    id: 'krea-2-lora',
    label: 'Krea 2 + LoRA',
    command: 'mflux-generate-krea2',
    model: 'mflux-community/krea-2-turbo-mflux-bf16',
    baseModel: 'krea-2',
    defaultSteps: 8,
    lora: {
      path:
        'Quiho/Krea2_TextFusion_Refusal-Reduction_LoRA_v1.0_lora:Krea2_TextFusion_Refusal_Reduction.safetensors',
      scale: 0.8,
    },
  },
  {
    id: 'ernie-image-turbo',
    label: 'ERNIE-Image Turbo',
    command: 'mflux-generate-ernie-image-turbo',
    model: 'mflux-community/ernie-image-turbo-mflux-bf16',
    baseModel: 'ernie-image-turbo',
    defaultSteps: 8,
  },
  {
    id: 'boogu-image-turbo',
    label: 'Boogu Image Turbo',
    command: 'mflux-generate-boogu',
    model: 'mflux-community/boogu-image-turbo-mflux-bf16',
    baseModel: 'boogu-image-turbo',
    defaultSteps: 4,
  },
  {
    id: 'moss-image',
    label: 'MOSS-Image',
    command: 'mflux-generate-moss-image',
    // OpenMOSS's instruction-tuned checkpoint (Apache-2.0) from mflux-community's bf16 copy (26.2 GB,
    // fetched on first use); Settings' Quantize converts it as it loads. Real CFG, so two passes a step.
    // mflux's own 50 steps and guidance 3 (the model card's), not yet judged: mflux 0.24.0's text
    // encoder returns NaN (a black picture) for prompts over ~200 tokens, so wait for the release with
    // the fix (docs/open-threads.md).
    model: 'mflux-community/moss-image-sft-mflux-bf16',
    baseModel: 'moss-image-sft',
    defaultSteps: 50,
    cfg: 3,
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
  },
  {
    id: 'qwen-image-2.1-turbo',
    label: 'Qwen-Image 2.1 Turbo',
    command: 'mflux-generate-qwen-2.1',
    // Qwen's own distilled checkpoint (mflux 0.23), not Viggle's LoRA: 8 steps on its fixed
    // sigmas, no CFG. A download of its own (~32 GB). mflux warns it turns fine detail into a
    // pixel grid below ~1024 px, so the small sizes suit it least.
    model: 'qwen-image-2.1-turbo',
    defaultSteps: 8,
    float16: true,
  },
  {
    id: 'qwen-image-2.1-viggle',
    label: 'Qwen-Image 2.1 Viggle Turbo',
    command: 'mflux-generate-qwen-2.1',
    model: 'qwen-image-2.1',
    // Viggle's turbo LoRA (v0.3, 1.3 GB, fetched on first use; Qwen research license) on Qwen-Image
    // 2.1: about 3.4x faster, smoother and less painterly. It must run at exactly 6 steps with its
    // own scheduler, so it takes no step cache (which leaves runs under 10 steps be anyway).
    defaultSteps: 6,
    stepPresets: [{ steps: 6, args: ['--steps', '6'] }],
    lora: {
      path:
        'Viggle/Qwen-Image-2.1-viggle-turbo:Qwen-Image-2.1-viggle-turbo-v0.3-6step-lora-r256.safetensors',
    },
    args: ['--scheduler', 'viggle_turbo'],
    float16: true,
  },
  {
    id: 'ming-image',
    label: 'Ming-Image 0.1 Design',
    command: 'mflux-generate-ming',
    // mflux-community's saved 8-bit copy: the DiT at 8 bits (4 breaks the lettering), and the ~16B MoE
    // text encoder at 8 too (25 GB, against 53 GB unsaved).
    model: 'mflux-community/ming-image-0-1-mflux-q8',
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
    cfg: 1,
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
    // A preset sets the steps, the guidance schedule and when the steps fall (mflux's
    // `Ideogram4Scheduler.PRESETS`); mflux ignores `--steps`. The turbo one also shifts the steps.
    defaultSteps: 20,
    stepPresets: [
      { steps: 12, args: ['--preset', 'V4_TURBO_12'] },
      { steps: 20, args: ['--preset', 'V4_DEFAULT_20'] },
      { steps: 48, args: ['--preset', 'V4_QUALITY_48'] },
    ],
  },
]

export function findMfluxModel(id: string): MfluxModel | undefined {
  return MFLUX_MODELS.find((m) => m.id === id)
}
