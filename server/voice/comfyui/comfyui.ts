import { extname } from '@std/path'
import {
  comfyBase,
  download,
  fillWorkflow,
  loadWorkflow,
  runWorkflow,
  upload,
  type Workflow,
} from '../../comfyui/client.ts'
import type { ComfyFile } from '../../../shared/comfyui.ts'
import type { SpeakRequest, VoiceEngine } from '../voice.ts'
import { exactSecondsOf, higgsText, WHISPER } from '../higgs.ts'

/**
 * Voices from a ComfyUI server with TTS Audio Suite's custom nodes (installed through ComfyUI's
 * Manager), the same models as the voice service: Qwen3-TTS VoiceDesign designs a voice from its
 * description, and Higgs TTS 3 clones that clip for every line (docs/research/comfyui.md).
 *
 * ComfyUI has no audio output that comes back over the WebSocket, as pictures do, so each workflow
 * ends in `PreviewAudio`, which writes to ComfyUI's temp folder rather than its output; the clip is
 * fetched (`/view`) and then overwritten with an empty stub, as is the reference clip uploaded to
 * be cloned. ComfyUI clears its temp folder when it next starts. Everything is FLAC (lossless): it's
 * what `PreviewAudio` writes, and there's no MP3 encoder here to shrink a line.
 *
 * Higgs takes ~10 GB of a GPU's memory, so a voice is heavy: the Text Model is unloaded first, as
 * for a render, and ComfyUI unloads Higgs after (`/free`, as after every job).
 */
export function comfyuiVoiceEngine(opts: {
  /** ComfyUI's address, its Backend's ('' for its usual one here). */
  address?: string
  /** How often a running job checks that ComfyUI still answers; shorter in tests. */
  checkEveryMs?: number
}): VoiceEngine {
  const checkEveryMs = opts.checkEveryMs ?? 15_000
  const base = comfyBase(opts.address ?? '')

  /** Runs a workflow and saves the clip it made to `out`, blanking ComfyUI's copy; gives the clip. */
  async function clip(base: string, workflow: Workflow, out: string, signal: AbortSignal) {
    const { outputs } = await runWorkflow(base, workflow, signal, checkEveryMs)
    const file = (outputs.out?.audio as ComfyFile[] | undefined)?.[0]
    if (!file) throw new Error('ComfyUI finished without the voice clip')
    try {
      const bytes = await download(base, file)
      await Deno.writeFile(out, bytes)
      return bytes
    } finally {
      await upload(base, file.filename, new Uint8Array(), file.subfolder).catch(() => {})
    }
  }

  return {
    profile: () => Promise.resolve({ ref: 'flac', speech: 'flac', heavy: true }),

    async design(req, signal) {
      const workflow = fillWorkflow(await voiceWorkflow('design'), {
        description: req.description,
        text: req.text,
        seed: nodeSeed(req.seed),
      })
      await clip(base, workflow, req.out, signal)
    },

    async speak(req, signal) {
      const name = `rpg-${crypto.randomUUID()}${extname(req.ref)}`
      const uploaded = await upload(base, name, await Deno.readFile(req.ref))
      try {
        const workflow = fillWorkflow(await voiceWorkflow('speak'), {
          ref: `${uploaded} [temp]`,
          refText: req.refText,
          text: comfyuiText(req),
          seed: nodeSeed(req.seed),
          maxFrames: req.maxFrames,
        })
        // The node doesn't say how many frames it took, so it's told by the clip's length.
        const seconds = flacSeconds(await clip(base, workflow, req.out, signal))
        return { ranOn: seconds >= exactSecondsOf(req.maxFrames) - RAN_ON_LEEWAY }
      } finally {
        await upload(base, uploaded, new Uint8Array()).catch(() => {})
      }
    },
  }
}

/** The custom nodes the workflows use, which Settings' check looks for. */
export const VOICE_NODES = [
  'Qwen3TTSEngineNode',
  'UnifiedVoiceDesignerNode',
  'CharacterVoicesNode',
  'HiggsAudioV3EngineNode',
  'UnifiedTTSTextNode',
] as const

const voiceWorkflow = (id: 'design' | 'speak') =>
  loadWorkflow(new URL(`./workflows/${id}.json`, import.meta.url))

/** A seed the nodes take: 1 to 2³²−1, as 0 means "random" to them. */
const nodeSeed = (seed: number) => (Math.abs(Math.trunc(seed)) % 0xffffffff) + 1

/**
 * A whisper, held low: through TTS Audio Suite (PyTorch), the whispering style alone took a man's
 * voice up to a woman's pitch on every seed (198–213 Hz against 81–102 plain, 2026-10-08), unlike
 * mlx-audio's Higgs on the Mac; with `pitch_low` it stayed his (72–73 Hz).
 */
const WHISPER_LOW = `${WHISPER}<|prosody:pitch_low|>`

/**
 * The line with Higgs's tags (`higgs.ts`), its whisper held low, and without square brackets:
 * TTS Audio Suite reads `[Name]` as a change of speaker.
 */
export const comfyuiText = (req: Pick<SpeakRequest, 'text' | 'pace' | 'sound' | 'whisper'>) =>
  higgsText({ ...req, text: req.text.replace(/[[\]]/g, '') }, WHISPER_LOW)

/** How far short of its cap's length a clip may be and still have run on: the node trims its ends. */
const RAN_ON_LEEWAY = 0.5

/**
 * A FLAC file's length in seconds, from its STREAMINFO block, which comes first: after "fLaC" and
 * the block's 4-byte header, a 20-bit sample rate at its byte 10 and a 36-bit count of samples
 * at its byte 13.
 */
export function flacSeconds(bytes: Uint8Array): number {
  const d = bytes.subarray(8)
  const rate = (d[10] << 12) | (d[11] << 4) | (d[12] >> 4)
  const samples = (d[13] & 0x0f) * 2 ** 32 + ((d[14] << 24) >>> 0) + (d[15] << 16) + (d[16] << 8) +
    d[17]
  return rate ? samples / rate : 0
}
