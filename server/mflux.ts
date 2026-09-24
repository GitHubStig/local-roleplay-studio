import { join } from '@std/path'
import type { ImageGenerator, ImageRequest } from './imageGenerator.ts'
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

export interface MfluxOptions {
  models?: readonly ImageModel[]
  /** Block Hugging Face downloads so a missing model fails fast instead of fetching GBs. */
  offline?: boolean
}

/** Renders images by running the `mflux-generate-*` CLI once per image. */
export function mfluxImageGenerator(opts: MfluxOptions = {}): ImageGenerator {
  const models = opts.models ?? IMAGE_MODELS
  const offline = opts.offline ?? true
  return {
    async generate(req, signal, onProgress) {
      signal.throwIfAborted()
      const model = models.find((m) => m.id === req.settings.imageModel) ??
        findImageModel(req.settings.imageModel)
      if (!model) throw new Error(`Unknown Image Model "${req.settings.imageModel}"`)

      const file = `${req.name}.png`
      const child = new Deno.Command(model.command, {
        args: mfluxArgs(model, req, join(req.dir, file)),
        env: offline ? { HF_HUB_OFFLINE: '1' } : {},
        stdout: 'null',
        stderr: 'piped',
        signal,
      }).spawn()

      let stderr = ''
      for await (const chunk of child.stderr.pipeThrough(new TextDecoderStream())) {
        stderr = (stderr + chunk).slice(-8000)
        const progress = parseProgress(chunk)
        if (progress) onProgress?.(progress.step, progress.total)
      }
      const status = await child.status
      signal.throwIfAborted()
      if (!status.success) {
        throw new Error(`${model.label} failed: ${lastMeaningfulLine(stderr)}`)
      }
      try {
        await Deno.stat(join(req.dir, file))
      } catch {
        throw new Error(`${model.label} finished without writing an image`)
      }
      return file
    },
  }
}
