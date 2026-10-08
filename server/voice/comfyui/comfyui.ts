import { extname } from '@std/path'
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
import type { SpeakRequest, VoiceEngine } from '../voice.ts'

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
  /** ComfyUI's address ('' for its default): Settings' now. */
  baseUrl: () => Promise<string>
  /** How often a running job checks that ComfyUI still answers; shorter in tests. */
  checkEveryMs?: number
}): VoiceEngine {
  const checkEveryMs = opts.checkEveryMs ?? 15_000

  /** Runs a workflow and saves the clip it made to `out`, blanking ComfyUI's copy. */
  async function clip(base: string, workflow: Workflow, out: string, signal: AbortSignal) {
    const { outputs } = await runWorkflow(base, workflow, signal, checkEveryMs)
    const file = (outputs.out?.audio as ComfyFile[] | undefined)?.[0]
    if (!file) throw new Error('ComfyUI finished without the voice clip')
    try {
      await Deno.writeFile(out, await download(base, file))
    } finally {
      await upload(base, file.filename, new Uint8Array(), file.subfolder).catch(() => {})
    }
  }

  return {
    profile: () => Promise.resolve({ ref: 'flac', speech: 'flac', heavy: true }),

    async design(req, signal) {
      const base = comfyBase(await opts.baseUrl())
      const workflow = fillWorkflow(await voiceWorkflow('design'), {
        description: req.description,
        text: req.text,
        seed: nodeSeed(req.seed),
      })
      await clip(base, workflow, req.out, signal)
    },

    async speak(req, signal) {
      const base = comfyBase(await opts.baseUrl())
      const name = `rpg-${crypto.randomUUID()}${extname(req.ref)}`
      const uploaded = await upload(base, name, await Deno.readFile(req.ref))
      try {
        const workflow = fillWorkflow(await voiceWorkflow('speak'), {
          ref: `${uploaded} [temp]`,
          refText: req.refText,
          text: higgsText(req),
          seed: nodeSeed(req.seed),
        })
        await clip(base, workflow, req.out, signal)
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

// A sound is its tag followed at once by the sound itself, as Higgs's model card says.
const SOUNDS = { sigh: 'Uh', laughter: 'Heh', cough: 'Ahem' } as const
const PACES = { slow: '<|prosody:speed_slow|>', fast: '<|prosody:speed_fast|>' } as const

/**
 * The line with Higgs's tags for its pace and sound, as the voice service writes them
 * (`directed` in `python/voice/serve.py`): a slow line also pauses between sentences, and a
 * whispered one (a thought) is hushed, still in the voice. Square brackets go: TTS Audio Suite
 * reads `[Name]` as a change of speaker.
 */
export function higgsText(req: Pick<SpeakRequest, 'text' | 'pace' | 'sound' | 'whisper'>): string {
  let text = req.text.replace(/[[\]]/g, '')
  if (req.pace === 'slow') text = text.replace(/([.!?…]) (?=\S)/g, '$1 <|prosody:pause|>')
  const sound = req.sound && req.sound !== 'none' ? req.sound : undefined
  const before = sound ? `<|sfx:${sound}|>${SOUNDS[sound]} ` : ''
  const pace = req.pace === 'slow' || req.pace === 'fast' ? PACES[req.pace] : ''
  return before + (req.whisper ? '<|style:whispering|>' : '') + pace + text
}
