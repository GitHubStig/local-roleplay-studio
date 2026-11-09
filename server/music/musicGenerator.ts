import type { Backend } from '../backends.ts'

/** What a music model is given to make a Cue's track: the Text Model's words, and set values. */
export interface MusicRequest {
  /** The sound and how it develops over the track, in the model's own style. */
  caption: string
  /** Section tags following the caption, and any lines to sing. */
  lyrics: string
  seconds: number
  bpm: number
  /** Such as "A minor". */
  key: string
  seed: number
  /** Directory to write the track into. */
  dir: string
  /** File name without extension; the generator picks the extension. */
  name: string
}

/** Reports the model's progress, as a render does. */
export type OnProgress = (step: number, total: number) => void

/** Makes music (ADR 0035): an adapter per model, in a folder of its own. */
export interface MusicGenerator {
  /** Makes the track and returns its file name inside `dir`. */
  makeMusic(req: MusicRequest, signal: AbortSignal, onProgress?: OnProgress): Promise<string>
}

/**
 * Makes music on the ComfyUI Settings send it to now (`backendOf`'s `music`: the one they name, or
 * else the one pictures go to, if they go to one, else the first listed).
 */
export function musicBackends(backends: {
  /** A ComfyUI at `address` ('' for its usual one here). */
  comfyui: (address: string) => MusicGenerator
  /** The Backend music goes to now; none when no Backend can make it. */
  backend: () => Promise<Backend | undefined>
}): MusicGenerator {
  return {
    async makeMusic(req, signal, onProgress) {
      const backend = await backends.backend()
      if (backend?.kind !== 'comfyui') {
        throw new Error('No Backend can make music: add a ComfyUI in Settings, on the Machines tab')
      }
      return backends.comfyui(backend.address).makeMusic(req, signal, onProgress)
    },
  }
}
