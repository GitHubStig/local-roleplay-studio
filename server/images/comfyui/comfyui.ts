import { join } from '@std/path'
import { type ImageGenerator, type OnPreview, UPSCALED_EDGE } from '../imageGenerator.ts'
import { SIZE_PRESETS } from '../../settings.ts'
import {
  comfyBase,
  fillWorkflow,
  getJson,
  runWorkflow,
  upload,
  type Workflow,
} from '../../comfyui/client.ts'
import { loadPrompt } from '../../promptFiles.ts'
import { maskBoxes } from '../maskBoxes.ts'
import { pngSize } from '../png.ts'
import {
  type ComfyEditor,
  type ComfyModel,
  findComfyEditor,
  findComfyModel,
  findComfyUpscaler,
} from './models.ts'
import { loadModelWorkflow, pickFiles } from './workflow.ts'

/**
 * Pictures from a ComfyUI server (`comfyui/client.ts`): the model's workflow ends in
 * `SaveImageWebsocket` (which ships with ComfyUI), so the picture itself comes back over the
 * WebSocket and is saved into the Session's folder; ComfyUI writes no file.
 */
export function comfyuiImageGenerator(opts: {
  /** ComfyUI's address, its Backend's ('' for its usual one here). */
  address?: string
  /** How often a running job checks that ComfyUI still answers (`watchAlive`); shorter in tests. */
  checkEveryMs?: number
} = {}): ImageGenerator {
  const checkEveryMs = opts.checkEveryMs ?? 15_000
  const base = comfyBase(opts.address ?? '')
  const picture = async (
    base: string,
    workflow: Workflow,
    signal: AbortSignal,
    onProgress?: (step: number, total: number) => void,
    onPreview?: OnPreview,
  ) => {
    const { png } = await runWorkflow(base, workflow, signal, checkEveryMs, onProgress, onPreview)
    if (!png) throw new Error('ComfyUI finished without sending the picture')
    return png
  }
  return {
    async generate(req, signal, onProgress, _onDownload, onPreview) {
      const model = findComfyModel(req.settings.imageModel)
      if (!model) throw new Error(`ComfyUI has no Image Model "${req.settings.imageModel}" here`)
      const size = SIZE_PRESETS.find((p) => p.id === req.settings.size) ?? SIZE_PRESETS[0]

      const workflow = fillWorkflow(await loadModelWorkflow(model.id), {
        ...await modelFiles(base, model, signal),
        prompt: req.prompt,
        seed: req.seed,
        steps: req.settings.steps,
        ...(model.cfg === undefined ? {} : { cfg: model.cfg }),
        width: size.width,
        height: size.height,
      })
      const file = `${req.name}.png`
      await Deno.writeFile(
        join(req.dir, file),
        await picture(base, workflow, signal, onProgress, onPreview),
      )
      return file
    },

    /**
     * An edit (ADR 0021), with an Image Model's own files: the picture is the reference, and the
     * painted area, if any, the latent's noise mask, so only it is repainted, the picture pasted
     * back around it. With nothing painted, the whole picture is repainted.
     */
    async edit(req, signal, onProgress) {
      const editor = findComfyEditor(req.model)
      const model = editor && findComfyModel(editor.model)
      if (!editor || !model) throw new Error(`ComfyUI has no edit model "${req.model}" here`)
      const files = await modelFiles(base, editor.files ?? model, signal)
      const image = await Deno.readFile(join(req.dir, req.image))
      const size = pngSize(image)
      const mask = req.mask ? await Deno.readFile(join(req.dir, req.mask)) : undefined
      const prompt = await editPrompt(editor, req.instruction, mask)
      return withUploads(base, mask ? [image, mask] : [image], async ([image, mask]) => {
        const workflow = fillWorkflow(await loadModelWorkflow(editor.workflow), {
          ...files,
          image: `${image} [temp]`,
          mask: mask ? `${mask} [temp]` : '',
          prompt,
          seed: req.seed,
          steps: editor.steps ?? model.defaultSteps,
          ...((editor.cfg ?? model.cfg) === undefined ? {} : { cfg: editor.cfg ?? model.cfg }),
          width: size.width,
          height: size.height,
        })
        if (!mask) {
          for (const node of ['mask', 'encode', 'masked', 'composite']) delete workflow[node]
          workflow.sampler.inputs.latent_image = ['conditioning', 2]
          workflow.save.inputs.images = ['rgb', 0]
        }
        const file = `${req.name}.png`
        await Deno.writeFile(join(req.dir, file), await picture(base, workflow, signal, onProgress))
        return file
      })
    },

    /** SeedVR2, built into ComfyUI. */
    async upscale(req, signal, onProgress) {
      const upscaler = findComfyUpscaler(req.model)
      if (!upscaler) throw new Error(`ComfyUI has no upscaler "${req.model}" here`)
      const files = await modelFiles(base, upscaler, signal)
      const image = await Deno.readFile(join(req.dir, req.image))
      return withUploads(base, [image], async ([image]) => {
        const workflow = fillWorkflow(await loadModelWorkflow('seedvr2'), {
          ...files,
          image: `${image} [temp]`,
          edge: UPSCALED_EDGE,
          seed: req.seed,
        })
        const file = `${req.name}.png`
        await Deno.writeFile(join(req.dir, file), await picture(base, workflow, signal, onProgress))
        return file
      })
    },
  }
}

/**
 * Uploads pictures for one workflow, as ComfyUI needs them as files: they go to its temp folder,
 * and afterwards a blank 1×1 picture is written over each, so ComfyUI keeps an empty stub, which it
 * clears from temp when it next starts (it has no API to delete an upload). A blank that fails is
 * let go, so what's reported is how the job went.
 */
async function withUploads<T>(
  base: string,
  pictures: Uint8Array<ArrayBuffer>[],
  use: (names: string[]) => Promise<T>,
): Promise<T> {
  const names: string[] = []
  try {
    for (const bytes of pictures) {
      names.push(await upload(base, `rpg-${crypto.randomUUID()}.png`, bytes))
    }
    return await use(names)
  } finally {
    await Promise.all(names.map((name) => upload(base, name, BLANK_PNG).catch(() => {})))
  }
}

/**
 * What an edit model is told: the instruction as typed, or its own prompt, which names each painted
 * area as a box (FLUX.3's layout table: `[ymin, xmin, ymax, xmax]` in thousandths).
 */
async function editPrompt(
  editor: ComfyEditor,
  instruction: string,
  mask?: Uint8Array<ArrayBuffer>,
) {
  if (!editor.prompt) return instruction
  const boxes = mask ? await maskBoxes(mask) : []
  if (!boxes.length) return loadPrompt(`images/${editor.prompt}-whole`, { instruction })
  const ids = boxes.map((_, i) => `obj_${i + 1}`)
  const thousandths = (n: number) => Math.round(n * 1000)
  return loadPrompt(`images/${editor.prompt}`, {
    instruction,
    areas: new Intl.ListFormat('en').format(ids.map((id) => `<${id}>`)),
    layout: JSON.stringify(boxes.map((box, i) => ({
      id: ids[i],
      bbox: [box.top, box.left, box.bottom, box.right].map(thousandths),
      desc: instruction,
    }))),
  })
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
