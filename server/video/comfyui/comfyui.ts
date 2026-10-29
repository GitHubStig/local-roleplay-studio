import { join } from '@std/path'
import {
  comfyBase,
  type ComfyFile,
  download,
  fillWorkflow,
  loadWorkflow,
  runWorkflow,
  upload,
  type Workflow,
} from '../../comfyui/client.ts'
import { modelFiles, withUploads } from '../../comfyui/files.ts'
import { loadPrompt } from '../../promptFiles.ts'
import { pngSize } from '../../png.ts'
import { clipFrames, clipSize, type VideoGenerator } from '../videoGenerator.ts'
import { type ComfyVideoModel, findComfyVideoModel } from './models.ts'

/**
 * Clips from a ComfyUI server, by the video model each asks for (`models.ts`; LTX 2.5 for now,
 * docs/video-plan.md): one workflow per model for every kind of clip, the pictures guided in at its first frame, its last, or both. The pictures are uploaded to
 * ComfyUI's temp folder and blanked after, as for an edit; `SaveVideo` writes the clip to ComfyUI's
 * output folder, from which it's fetched (`/view`) and then overwritten with an empty stub, so no
 * copy stays with ComfyUI. The clip comes out at about 1280×704's pixels, in the first picture's
 * shape (`clipSize`), with LTX's sound.
 */
export function comfyuiVideoGenerator(opts: {
  /** ComfyUI's address, its Backend's ('' for its usual one here). */
  address?: string
  /** How often a running job checks that ComfyUI still answers; shorter in tests. */
  checkEveryMs?: number
}): VideoGenerator {
  const checkEveryMs = opts.checkEveryMs ?? 15_000
  const base = comfyBase(opts.address ?? '')

  return {
    async makeClip(req, signal, onProgress) {
      // An Idle Loop's picture is at both ends: sent once.
      const ends = [...new Set([req.first, req.last])].filter((end): end is string => !!end)
      if (!ends.length) throw new Error('A clip needs a picture at one end at least')
      const pictures = await Promise.all(ends.map((end) => Deno.readFile(join(req.dir, end))))
      const { width, height } = pngSize(pictures[0])
      const size = clipSize(width, height)
      const model = findComfyVideoModel(req.model)
      if (!model) throw new Error(`ComfyUI has no video model "${req.model}"`)
      const files = await modelFiles(base, model, signal)
      const negative = await loadPrompt('video/negative')
      return withUploads(base, pictures, async (names) => {
        const uploaded = (end?: string) => end && `${names[ends.indexOf(end)]} [temp]`
        const workflow = fillWorkflow(
          withoutEnds(await clipWorkflow(model), { first: !!req.first, last: !!req.last }),
          {
            ...files,
            prompt: req.prompt,
            negative: req.speech ? negative : `${negative}, ${await loadPrompt('video/no-speech')}`,
            ...size,
            frames: clipFrames(req.seconds),
            seed: req.seed,
            first: uploaded(req.first),
            last: uploaded(req.last),
          },
        )
        const { outputs } = await runWorkflow(base, workflow, signal, checkEveryMs, onProgress)
        const file = (outputs.out?.images as ComfyFile[] | undefined)?.[0]
        if (!file) throw new Error('ComfyUI finished without the clip')
        const name = `${req.name}.mp4`
        try {
          await Deno.writeFile(join(req.dir, name), await download(base, file))
        } finally {
          await upload(base, file.filename, new Uint8Array(), file.subfolder, 'output')
            .catch(() => {})
        }
        return name
      })
    },
  }
}

const clipWorkflow = (model: ComfyVideoModel) =>
  loadWorkflow(new URL(`./workflows/${model.workflow}.json`, import.meta.url))

/**
 * The workflow without the guide (and its picture's nodes) at an end that has no picture: whatever
 * took the guide's conditioning and latent takes what the guide was given instead.
 */
export function withoutEnds(workflow: Workflow, keep: { first: boolean; last: boolean }): Workflow {
  let nodes = workflow
  for (const end of ['first', 'last'] as const) {
    if (keep[end]) continue
    const guide = nodes[`${end}Guide`].inputs
    const passed = [guide.positive, guide.negative, guide.latent]
    const dropped = new Set(['Image', 'Scale', 'Prep', 'Guide'].map((part) => `${end}${part}`))
    nodes = Object.fromEntries(
      Object.entries(nodes).filter(([id]) => !dropped.has(id)).map(([id, node]) => [id, {
        ...node,
        inputs: Object.fromEntries(
          Object.entries(node.inputs).map(([key, value]) => [
            key,
            Array.isArray(value) && value[0] === `${end}Guide` ? passed[value[1] as number] : value,
          ]),
        ),
      }]),
    )
  }
  return nodes
}
