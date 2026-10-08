import { join } from '@std/path'
import { type ImageGenerator, UPSCALED_EDGE } from '../imageGenerator.ts'
import { SIZE_PRESETS } from '../../settings.ts'
import {
  comfyBase,
  fillWorkflow,
  getJson,
  runWorkflow,
  upload,
  type Workflow,
} from '../../comfyui/client.ts'
import { type ComfyModel, findComfyModel, findComfyUpscaler } from './models.ts'
import { loadModelWorkflow, pickFiles } from './workflow.ts'

/**
 * Pictures from a ComfyUI server (`comfyui/client.ts`): the model's workflow ends in
 * `SaveImageWebsocket` (which ships with ComfyUI), so the picture itself comes back over the
 * WebSocket and is saved into the Session's folder; ComfyUI writes no file. The address is the
 * Session's `imageBaseUrl`, or ComfyUI's default.
 */
export function comfyuiImageGenerator(opts: {
  /**
   * ComfyUI's address for upscaling ('' for its default): Settings' now, as the Upscaler is read
   * when upscaling. A render uses its Session's.
   */
  upscaleUrl?: () => Promise<string>
  /** How often a running job checks that ComfyUI still answers (`watchAlive`); shorter in tests. */
  checkEveryMs?: number
} = {}): ImageGenerator {
  const checkEveryMs = opts.checkEveryMs ?? 15_000
  const picture = async (
    base: string,
    workflow: Workflow,
    signal: AbortSignal,
    onProgress?: (step: number, total: number) => void,
  ) => {
    const { png } = await runWorkflow(base, workflow, signal, checkEveryMs, onProgress)
    if (!png) throw new Error('ComfyUI finished without sending the picture')
    return png
  }
  return {
    async generate(req, signal, onProgress) {
      const base = comfyBase(req.settings.imageBaseUrl)
      const model = findComfyModel(req.settings.imageModel)
      if (!model) throw new Error(`ComfyUI has no Image Model "${req.settings.imageModel}" here`)
      const size = SIZE_PRESETS.find((p) => p.id === req.settings.size) ?? SIZE_PRESETS[0]

      const workflow = fillWorkflow(await loadModelWorkflow(model.id), {
        ...await modelFiles(base, model, signal),
        prompt: req.prompt,
        seed: req.seed,
        steps: req.settings.steps,
        width: size.width,
        height: size.height,
      })
      const file = `${req.name}.png`
      await Deno.writeFile(join(req.dir, file), await picture(base, workflow, signal, onProgress))
      return file
    },

    /**
     * SeedVR2, built into ComfyUI. The picture has to reach ComfyUI as a file: it goes to its temp
     * folder, and afterwards a blank 1×1 picture is written over it, so ComfyUI keeps an empty
     * stub, which it clears from temp when it next starts (it has no API to delete an upload).
     */
    async upscale(req, signal, onProgress) {
      const base = comfyBase(await opts.upscaleUrl?.() ?? '')
      const upscaler = findComfyUpscaler(req.model)
      if (!upscaler) throw new Error(`ComfyUI has no upscaler "${req.model}" here`)
      const files = await modelFiles(base, upscaler, signal)
      const name = `rpg-${crypto.randomUUID()}.png`
      const uploaded = await upload(base, name, await Deno.readFile(join(req.dir, req.image)))
      try {
        const workflow = fillWorkflow(await loadModelWorkflow('seedvr2'), {
          ...files,
          image: `${uploaded} [temp]`,
          edge: UPSCALED_EDGE,
          seed: req.seed,
        })
        const file = `${req.name}.png`
        await Deno.writeFile(join(req.dir, file), await picture(base, workflow, signal, onProgress))
        return file
      } finally {
        await upload(base, uploaded, BLANK_PNG).catch(() => {})
      }
    },
  }
}

/** A 1×1 transparent PNG, written over an uploaded picture once it's been used. */
const BLANK_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

/** The files a model's loaders use on this ComfyUI (`pickFiles`); throws naming any missing. */
export async function modelFiles(
  base: string,
  model: Pick<ComfyModel, 'label' | 'files'>,
  signal: AbortSignal,
) {
  const installed = new Map<string, string[]>()
  for (const folder of new Set(Object.values(model.files).map((f) => f.folder))) {
    installed.set(folder, await getJson(base, `/models/${folder}`, signal))
  }
  return pickFiles(model, (folder) => installed.get(folder) ?? [])
}
