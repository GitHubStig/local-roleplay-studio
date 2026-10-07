import { join } from '@std/path'
import { track } from '../../children.ts'
import {
  type ImageGenerator,
  type ImageRequest,
  type OnProgress,
  UPSCALED_EDGE,
  type UpscaleRequest,
} from '../imageGenerator.ts'
import { findMfluxModel, MFLUX_MODELS, type MfluxModel } from './models.ts'
import { type QuantizedStore, quantizedStore } from './quantized.ts'
import { SIZE_PRESETS } from '../../settings.ts'

/**
 * The mflux command line for one image, with the model's step cache or fast mode as Settings ask.
 * With a saved quantized copy (`saved`, its folder), the render loads that, named by the model it's
 * based on; otherwise a Quantize setting converts the full weights as it goes (slower, and no lower
 * peak: see quantized.ts).
 */
export function mfluxArgs(
  model: MfluxModel,
  req: ImageRequest,
  output: string,
  saved?: string,
): string[] {
  const { settings } = req
  const size = SIZE_PRESETS.find((p) => p.id === settings.size) ?? SIZE_PRESETS[0]
  const quantize = settings.quantize && !model.preQuantized && !saved
  const fast = settings.fast ? model.fast : undefined
  // The step cache leaves runs under 10 steps be, so it's never added to a fast one.
  const stepCache = !fast && model.stepCache ? settings.stepCache : null
  return [
    '--model',
    saved ?? model.model,
    ...(saved ? ['--base-model', model.baseModel ?? model.model] : []),
    ...(!saved && model.baseModel ? ['--base-model', model.baseModel] : []),
    '--prompt',
    req.prompt,
    '--seed',
    String(req.seed),
    '--steps',
    String(fast?.steps ?? settings.steps),
    ...(fast ? ['--scheduler', fast.scheduler, '--lora', fast.lora, '1.0'] : []),
    ...(stepCache ? ['--step-cache-ratio', String(stepCache)] : []),
    '--width',
    String(size.width),
    '--height',
    String(size.height),
    ...(quantize ? ['--quantize', String(settings.quantize)] : []),
    '--output',
    output,
  ]
}

/** The SeedVR2 upscaler command; the model (7B or 3B) comes from Settings. */
const UPSCALER = { label: 'SeedVR2 upscaler', command: 'mflux-upscale-seedvr2' }

/** The mflux command line for upscaling one image. */
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
  if (!status.success) throw new Error(`${label} failed: ${lastMeaningfulLine(stderr)}`)
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
  /** Saved quantized copies to render from when Settings ask for Quantize. */
  quantized?: QuantizedStore
}

/** The mflux version `uv` has installed, e.g. `0.20.0`; `unknown` if it can't tell. */
async function installedMfluxVersion(): Promise<string> {
  try {
    const { stdout } = await new Deno.Command('uv', { args: ['tool', 'list'], stderr: 'null' })
      .output()
    return new TextDecoder().decode(stdout).match(/^mflux v(\S+)/m)?.[1] ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Saved quantized copies made with `mflux-save`, kept in `root` (`models/quantized`). */
export function mfluxQuantizedStore(root: string): QuantizedStore {
  let version: Promise<string> | null = null
  return quantizedStore(root, {
    mfluxVersion: () => (version ??= installedMfluxVersion()),
    save: (model, bits, path, signal, onDownload) =>
      runCommand(
        'mflux-save',
        ['--model', model.model, '--quantize', String(bits), '--path', path],
        `Saving ${model.label} at ${bits}-bit`,
        signal,
        undefined,
        onDownload,
      ),
  })
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
    async generate(req, signal, onProgress, onDownload) {
      signal.throwIfAborted()
      const model = models.find((m) => m.id === req.settings.imageModel) ??
        findMfluxModel(req.settings.imageModel)
      if (!model) throw new Error(`Unknown Image Model "${req.settings.imageModel}"`)

      const file = `${req.name}.png`
      // Render from a saved quantized copy (made now if there's none yet); if saving one fails
      // for this model, convert as it goes instead, as mflux's --quantize does.
      const bits = req.settings.quantize
      let saved: string | undefined
      if (bits && !model.preQuantized && opts.quantized) {
        saved = await opts.quantized.ensure(model, bits, signal, onDownload).catch((err) => {
          signal.throwIfAborted()
          console.warn(
            `No saved ${bits}-bit copy of ${model.label}; converting as it goes:`,
            err.message,
          )
          return undefined
        })
      }
      await runCommand(
        model.command,
        mfluxArgs(model, req, join(req.dir, file), saved),
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
