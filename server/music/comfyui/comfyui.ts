import { extname, join } from '@std/path'
import {
  comfyBase,
  type ComfyFile,
  download,
  fillWorkflow,
  loadWorkflow,
  runWorkflow,
  upload,
} from '../../comfyui/client.ts'
import { clearTraces, historyOf, type ModelFiles, modelFiles } from '../../comfyui/files.ts'
import type { MusicGenerator } from '../musicGenerator.ts'

/** ACE-Step 1.5's XL turbo with its 4B planner, the one setup on every machine (ADR 0035). */
export const ACE_STEP: ModelFiles = {
  label: 'ACE-Step 1.5',
  files: {
    unet: { folder: 'diffusion_models', patterns: [/^acestep_v1\.5_xl_turbo/] },
    encoder: { folder: 'text_encoders', patterns: [/^qwen_0\.6b_ace15/] },
    planner: { folder: 'text_encoders', patterns: [/^qwen_4b_ace15/] },
    vae: { folder: 'vae', patterns: [/^ace_1\.5_vae/] },
  },
}

/**
 * Music from a ComfyUI server with ACE-Step 1.5, by ComfyUI's own nodes. As for a voice, the track
 * comes from `PreviewAudio` in ComfyUI's temp folder, as a FLAC: it's fetched (`/view`), then
 * overwritten with an empty stub, so no copy stays with ComfyUI.
 */
export function comfyuiMusicGenerator(opts: {
  /** ComfyUI's address, its Backend's ('' for its usual one here). */
  address?: string
  /** How often a running job checks that ComfyUI still answers; shorter in tests. */
  checkEveryMs?: number
}): MusicGenerator {
  const checkEveryMs = opts.checkEveryMs ?? 15_000
  const base = comfyBase(opts.address ?? '')

  return {
    async makeMusic(req, signal, onProgress) {
      const workflow = fillWorkflow(
        await loadWorkflow(new URL('./workflows/ace-step-1.5-xl-turbo.json', import.meta.url)),
        {
          ...await modelFiles(base, ACE_STEP, signal),
          caption: req.caption,
          lyrics: req.lyrics,
          seconds: req.seconds,
          bpm: req.bpm,
          key: req.key,
          seed: req.seed,
        },
      )
      const { outputs } = await runWorkflow(base, workflow, signal, checkEveryMs, onProgress)
      const file = (outputs.out?.audio as ComfyFile[] | undefined)?.[0]
      if (!file) throw new Error('ComfyUI finished without the music')
      const name = `${req.name}${extname(file.filename)}`
      try {
        await Deno.writeFile(join(req.dir, name), await download(base, file))
      } finally {
        await upload(base, file.filename, new Uint8Array(), file.subfolder).catch(() => {})
      }
      return name
    },

    async pickUp(left, dir, name, signal) {
      const prompt = left.prompts.at(-1)
      try {
        if (!prompt) return undefined
        const done = await historyOf(base, prompt.promptId, { signal, everyMs: checkEveryMs / 5 })
        const file = done?.status?.status_str === 'success'
          ? (done.outputs?.out?.audio as ComfyFile[] | undefined)?.[0]
          : undefined
        if (!file) return undefined
        const saved = `${name}${extname(file.filename)}`
        await Deno.writeFile(join(dir, saved), await download(base, file))
        return saved
      } finally {
        await clearTraces(left, 30_000, 1000).catch((err) =>
          console.warn(`Couldn't clean up after music on ComfyUI: ${err.message}`)
        )
      }
    },
  }
}
