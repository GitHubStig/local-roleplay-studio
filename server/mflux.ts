import { join } from '@std/path'
import { track } from './children.ts'
import {
  type ImageGenerator,
  type ImageRequest,
  UPSCALED_EDGE,
  type UpscaleRequest,
} from './imageGenerator.ts'
import { findImageModel, IMAGE_MODELS, type ImageModel } from './imageModels.ts'
import { SIZE_PRESETS } from './settings.ts'

/** The mflux command line for one image. */
export function mfluxArgs(model: ImageModel, req: ImageRequest, output: string): string[] {
  const { settings } = req
  const size = SIZE_PRESETS.find((p) => p.id === settings.size) ?? SIZE_PRESETS[0]
  return [
    '--model',
    model.model,
    ...(model.baseModel ? ['--base-model', model.baseModel] : []),
    '--prompt',
    req.prompt,
    '--seed',
    String(req.seed),
    '--steps',
    String(settings.steps),
    '--width',
    String(size.width),
    '--height',
    String(size.height),
    ...(settings.quantize && !model.preQuantized ? ['--quantize', String(settings.quantize)] : []),
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

/** Runs one mflux command to completion, reporting its progress; throws if it fails. */
async function runCommand(
  command: string,
  args: string[],
  label: string,
  offline: boolean,
  signal: AbortSignal,
  onProgress?: (step: number, total: number) => void,
): Promise<void> {
  const child = new Deno.Command(command, {
    args,
    env: offline ? { HF_HUB_OFFLINE: '1' } : {},
    stdout: 'null',
    stderr: 'piped',
    signal,
  }).spawn()
  track(child)

  let stderr = ''
  for await (const chunk of child.stderr.pipeThrough(new TextDecoderStream())) {
    stderr = (stderr + chunk).slice(-8000)
    const progress = parseProgress(chunk)
    if (progress) onProgress?.(progress.step, progress.total)
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
  models?: readonly ImageModel[]
  /** Block Hugging Face downloads so a missing model fails fast instead of fetching GBs. */
  offline?: boolean
}

/** Renders images by running the `mflux-generate-*` CLI once per image. */
export function mfluxImageGenerator(opts: MfluxOptions = {}): ImageGenerator {
  const models = opts.models ?? IMAGE_MODELS
  const offline = opts.offline ?? true
  const run = (
    command: string,
    args: string[],
    label: string,
    signal: AbortSignal,
    onProgress?: (step: number, total: number) => void,
  ) => runCommand(command, args, label, offline, signal, onProgress)
  return {
    async upscale(req, signal, onProgress) {
      signal.throwIfAborted()
      const file = `${req.name}.png`
      const args = upscaleArgs(req, join(req.dir, file))
      await run(UPSCALER.command, args, UPSCALER.label, signal, onProgress)
      await mustExist(req.dir, file, UPSCALER.label)
      return file
    },
    async generate(req, signal, onProgress) {
      signal.throwIfAborted()
      const model = models.find((m) => m.id === req.settings.imageModel) ??
        findImageModel(req.settings.imageModel)
      if (!model) throw new Error(`Unknown Image Model "${req.settings.imageModel}"`)

      const file = `${req.name}.png`
      await run(
        model.command,
        mfluxArgs(model, req, join(req.dir, file)),
        model.label,
        signal,
        onProgress,
      )
      await mustExist(req.dir, file, model.label)
      return file
    },
  }
}
