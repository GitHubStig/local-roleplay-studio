import { fromFileUrl, join } from '@std/path'
import { track } from '../../children.ts'
import type { EditModelOn } from '../editModels.ts'
import {
  type EditRequest,
  type ImageGenerator,
  type ImageRequest,
  type OnProgress,
  UPSCALED_EDGE,
  type UpscaleRequest,
} from '../imageGenerator.ts'
import { pngSize } from '../../png.ts'
import { float16On } from './chip.ts'
import { findMfluxModel, type Lora, MFLUX_MODELS, type MfluxModel } from './models.ts'
import { SIZE_PRESETS } from '../../settings.ts'

/** Straight double quotes as curly ones: opening after a space or bracket, or at the start. */
export function curlQuotes(text: string): string {
  return text.replace(/(^|[\s([{])"/g, '$1\u201c').replaceAll('"', '\u201d')
}

/** `--lora` for a LoRA, its `./` or `../` path resolved from the repo's root. */
export function loraArgs(lora: Lora): string[] {
  const path = /^\.\.?\//.test(lora.path)
    ? fromFileUrl(new URL(lora.path, new URL('../../../', import.meta.url)))
    : lora.path
  return ['--lora', path, ...(lora.scale === undefined ? [] : [String(lora.scale)])]
}

/**
 * The mflux command line for one image, at its steps (or its preset for them), with the model's
 * step cache and float16 as Settings ask (`chip` is this Mac's, for float16's Automatic). Always `--low-ram`: it holds a part of the model only while it's used, so the peak
 * is a quarter of what it is without it, in the same time (docs/research/mflux-upgrade-log.md). A Quantize setting
 * converts the weights as they load.
 */
export function mfluxArgs(
  model: MfluxModel,
  req: ImageRequest,
  output: string,
  chip?: number | null,
): string[] {
  const { settings } = req
  const size = SIZE_PRESETS.find((p) => p.id === settings.size) ?? SIZE_PRESETS[0]
  const quantize = settings.quantize && !model.preQuantized
  const presets = model.stepPresets
  const preset = presets &&
    (presets.find((p) => p.steps === settings.steps) ??
      presets.find((p) => p.steps === model.defaultSteps)!)
  const stepCache = model.stepCache ? settings.stepCache : null
  return [
    '--model',
    model.model,
    ...(model.baseModel ? ['--base-model', model.baseModel] : []),
    '--prompt',
    model.curlyQuotes ? curlQuotes(req.prompt) : req.prompt,
    '--seed',
    String(req.seed),
    ...(preset ? preset.args : ['--steps', String(settings.steps)]),
    ...(stepCache ? ['--step-cache-ratio', String(stepCache)] : []),
    '--width',
    String(size.width),
    '--height',
    String(size.height),
    ...(quantize ? ['--quantize', String(settings.quantize)] : []),
    ...(model.float16 && float16On(settings.float16, chip)
      ? ['--compute-precision', 'float16']
      : []),
    ...(model.cfg === undefined ? [] : ['--guidance', String(model.cfg)]),
    ...(model.lora ? loraArgs(model.lora) : []),
    ...(model.args ?? []),
    '--low-ram',
    '--output',
    output,
  ]
}

/** The SeedVR2 upscaler command; the model (7B or 3B) comes from Settings. */
const UPSCALER = { label: 'SeedVR2 upscaler', command: 'mflux-upscale-seedvr2' }

/**
 * The mflux command line for upscaling one image. `--low-ram` here costs time (SeedVR2 7B, 1024 px
 * to 2048: 57 s against 45–47 s) for a peak near half (20 GB against 36 GB; docs/research/image-models.md).
 */
export function upscaleArgs(req: UpscaleRequest, output: string): string[] {
  return [
    '--model',
    req.model,
    '--image-path',
    join(req.dir, req.image),
    '--resolution',
    String(UPSCALED_EDGE),
    '--seed',
    String(req.seed),
    '--low-ram',
    '--output',
    output,
  ]
}

/**
 * The command for each edit model mflux runs (ADR 0021), and the model it loads: mflux's own default
 * for the base Qwen-Image 2.1 (mflux-community's copy can't edit, docs/research/mflux-upgrade-log.md).
 * Turbo edits at its own 8 steps, mflux's default for it.
 */
const EDITORS: Record<EditModelOn<'mflux'>, { label: string; command: string; model?: string[] }> =
  {
    'qwen-image-2.1-edit': {
      label: 'Qwen-Image 2.1 Edit',
      command: 'mflux-generate-qwen-2.1-edit',
    },
    'qwen-image-2.1-turbo-edit': {
      label: 'Qwen-Image 2.1 Turbo Edit',
      command: 'mflux-generate-qwen-2.1-edit',
      model: [
        '--model',
        'mflux-community/qwen-image-2-1-turbo-mflux-bf16',
        '--base-model',
        'qwen-image-2.1-turbo',
      ],
    },
  }

/**
 * The mflux command line for one edit, at the picture's own size (rounded down to a multiple of 32,
 * which every size preset already is), quantized as Settings ask (8-bit by default: a 15.1 GB peak
 * against 39 GB for the full weights, the edit looking the same; docs/research/image-models.md,
 * "Qwen-Image 2.1 Edit"). Always `--low-ram`.
 */
export function editArgs(
  req: EditRequest,
  size: { width: number; height: number },
  output: string,
): string[] {
  const fit = (n: number) => String(Math.max(32, n - (n % 32)))
  return [
    ...(EDITORS[req.model as EditModelOn<'mflux'>]?.model ?? []),
    '--image-paths',
    join(req.dir, req.image),
    ...(req.mask ? ['--mask-image', join(req.dir, req.mask)] : []),
    '--prompt',
    req.instruction,
    '--seed',
    String(req.seed),
    '--width',
    fit(size.width),
    '--height',
    fit(size.height),
    ...(req.quantize ? ['--quantize', String(req.quantize)] : []),
    '--low-ram',
    '--output',
    output,
  ]
}

/** Pulls the latest `step/total` from mflux's progress bar output, if any. */
export function parseProgress(text: string): { step: number; total: number } | undefined {
  const matches = [...text.matchAll(/(\d+)\/(\d+) \[/g)]
  const last = matches.at(-1)
  return last ? { step: Number(last[1]), total: Number(last[2]) } : undefined
}

/** The most useful line of mflux's stderr for an error message. */
function lastMeaningfulLine(stderr: string): string {
  const lines = stderr.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)
  return lines.findLast((l) => /error|exception|not found|offline/i.test(l)) ?? lines.at(-1) ??
    'no output'
}

/**
 * Why mflux failed, for the player. A gated model (Ideogram 4) the account hasn't accepted, or with
 * no Hugging Face sign-in here, fails with a bare 401 or 403, so that's spelled out.
 */
export function failureReason(stderr: string): string {
  const line = lastMeaningfulLine(stderr)
  return /\b40[13]\b|GatedRepo/.test(stderr)
    ? `${line}. If the model is gated, accept its terms on its Hugging Face page, then sign in here with \`hf auth login\``
    : line
}

/**
 * Runs one mflux command to completion, reporting its progress; throws if it fails. A model that
 * isn't downloaded yet is downloaded from Hugging Face first: mflux shows that as a "Fetching N
 * files" bar, which is reported as `onDownload`, not as steps.
 */
async function runCommand(
  command: string,
  args: string[],
  label: string,
  signal: AbortSignal,
  onProgress?: OnProgress,
  onDownload?: () => void,
): Promise<void> {
  const child = new Deno.Command(command, {
    args,
    stdout: 'null',
    stderr: 'piped',
    signal,
  }).spawn()
  track(child)

  let stderr = ''
  for await (const chunk of child.stderr.pipeThrough(new TextDecoderStream())) {
    stderr = (stderr + chunk).slice(-8000)
    for (const line of chunk.split(/[\r\n]+/)) {
      if (/Fetching \d+ files/.test(line)) onDownload?.()
      else {
        const progress = parseProgress(line)
        if (progress) onProgress?.(progress.step, progress.total)
      }
    }
  }
  const status = await child.status
  signal.throwIfAborted()
  if (!status.success) throw new Error(`${label} failed: ${failureReason(stderr)}`)
}

async function mustExist(dir: string, file: string, label: string): Promise<void> {
  try {
    await Deno.stat(join(dir, file))
  } catch {
    throw new Error(`${label} finished without writing an image`)
  }
}

export interface MfluxOptions {
  models?: readonly MfluxModel[]
}

/** Renders images by running the `mflux-generate-*` CLI once per image. */
export function mfluxImageGenerator(opts: MfluxOptions = {}): ImageGenerator {
  const models = opts.models ?? MFLUX_MODELS
  return {
    async upscale(req, signal, onProgress, onDownload) {
      signal.throwIfAborted()
      const file = `${req.name}.png`
      const args = upscaleArgs(req, join(req.dir, file))
      await runCommand(UPSCALER.command, args, UPSCALER.label, signal, onProgress, onDownload)
      await mustExist(req.dir, file, UPSCALER.label)
      return file
    },
    async edit(req, signal, onProgress, onDownload) {
      signal.throwIfAborted()
      const editor = EDITORS[req.model as EditModelOn<'mflux'>]
      if (!editor) throw new Error(`mflux doesn't run the edit model "${req.model}"`)
      const size = pngSize(await Deno.readFile(join(req.dir, req.image)))
      const file = `${req.name}.png`
      const args = editArgs(req, size, join(req.dir, file))
      await runCommand(editor.command, args, editor.label, signal, onProgress, onDownload)
      await mustExist(req.dir, file, editor.label)
      return file
    },
    async generate(req, signal, onProgress, onDownload) {
      signal.throwIfAborted()
      const model = models.find((m) => m.id === req.settings.imageModel) ??
        findMfluxModel(req.settings.imageModel)
      if (!model) throw new Error(`Unknown Image Model "${req.settings.imageModel}"`)

      const file = `${req.name}.png`
      await runCommand(
        model.command,
        mfluxArgs(model, req, join(req.dir, file)),
        model.label,
        signal,
        onProgress,
        onDownload,
      )
      await mustExist(req.dir, file, model.label)
      return file
    },
  }
}
