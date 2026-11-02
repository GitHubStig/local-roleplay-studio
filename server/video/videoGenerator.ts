import type { Backend } from '../backends.ts'
import type { ComfyTraces } from '../comfyui/traces.ts'

/**
 * A Frame's picture as a short clip (ADR 0025). Where the picture sits in the clip is the
 * kind of clip, as a picture shows the middle of what its Frame describes: a clip can lead up to
 * it, go on from it, or move a little and come back to it.
 */
export type ClipKind = 'lead-in' | 'play-out' | 'idle-loop' | 'into-next'

export const CLIP_KINDS: readonly ClipKind[] = ['lead-in', 'play-out', 'idle-loop', 'into-next']

/**
 * Which picture each end of a kind of clip holds: the Frame's own (`still`), the next Frame's
 * (`next`, for Into Next), or none, left for the model to make up.
 */
export const CLIP_ENDS: Record<ClipKind, { first?: 'still'; last?: 'still' | 'next' }> = {
  'lead-in': { last: 'still' },
  'play-out': { first: 'still' },
  'idle-loop': { first: 'still', last: 'still' },
  'into-next': { first: 'still', last: 'next' },
}

/** A clip's size: Small (~0.4 MP, faster) or Large (the model's trained size, ~0.9 MP). */
export type ClipSize = 'small' | 'large'

export const CLIP_SIZES: readonly ClipSize[] = ['small', 'large']

export const CLIP_SIZE_NAMES: Record<ClipSize, string> = { small: 'Small', large: 'Large' }

export interface ClipRequest {
  /** The video model, by id (`comfyui/models.ts`). */
  model: string
  /** The pictures at the clip's ends, file names inside `dir`; at least one. */
  first?: string
  last?: string
  /** What happens between them: the movement, the camera and the sound. */
  prompt: string
  /** Whether anyone may speak; without, the clip has only background sound. */
  speech: boolean
  /** Its length in seconds. */
  seconds: number
  /** Its size; the model's own, unless given. */
  size?: ClipSize
  seed: number
  /** Directory to read the pictures from and write the clip into. */
  dir: string
  /** File name without extension; the generator picks the extension. */
  name: string
}

/** Reports the sampler's progress, as a render does. */
export type OnProgress = (step: number, total: number) => void

export interface VideoGenerator {
  /** Makes the clip and returns its file name inside `dir`. */
  makeClip(req: ClipRequest, signal: AbortSignal, onProgress?: OnProgress): Promise<string>
  /**
   * Picks up a clip a server restart cut off (`left`, what it left on its ComfyUI): waits for its
   * prompt if it's still running, saves the clip it made into `dir` as `name` and returns its file
   * name; none if there's none to pick up (it failed, or ComfyUI lost it). Either way, cleans up
   * what was left.
   */
  pickUp?(
    left: ComfyTraces,
    dir: string,
    name: string,
    signal: AbortSignal,
  ): Promise<string | undefined>
}

/**
 * Makes clips on the ComfyUI Settings send them to now (`backendOf`'s `video`: the one pictures go
 * to, if they go to one, else the first listed).
 */
export function videoBackends(backends: {
  /** A ComfyUI at `address` ('' for its usual one here). */
  comfyui: (address: string) => VideoGenerator
  /** The Backend clips go to now; none when no Backend can make them. */
  backend: () => Promise<Backend | undefined>
}): VideoGenerator {
  return {
    async makeClip(req, signal, onProgress) {
      const backend = await backends.backend()
      if (backend?.kind !== 'comfyui') {
        throw new Error('No Backend can make clips: add a ComfyUI in Settings, on the Machines tab')
      }
      return backends.comfyui(backend.address).makeClip(req, signal, onProgress)
    },
    // On the ComfyUI it was made on, whatever Settings say now.
    pickUp(left, dir, name, signal) {
      const base = left.prompts.at(-1)?.base
      return base
        ? backends.comfyui(base).pickUp!(left, dir, name, signal)
        : Promise.resolve(undefined)
    },
  }
}
