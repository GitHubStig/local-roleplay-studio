/**
 * A Frame's picture as a short clip (docs/video-plan.md). Where the picture sits in the clip is the
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

export interface ClipRequest {
  /** The pictures at the clip's ends, file names inside `dir`; at least one. */
  first?: string
  last?: string
  /** What happens between them: the movement, the camera and the sound. */
  prompt: string
  /** Whether anyone may speak; without, the clip has only background sound. */
  speech: boolean
  /** Its length in seconds. */
  seconds: number
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
}

/** Frames per second of every clip. */
export const CLIP_FPS = 24

/** A clip's frame count: LTX takes 8n + 1, the nearest at 24 fps (5 s is 121). */
export const clipFrames = (seconds: number) =>
  Math.max(1, Math.round((seconds * CLIP_FPS) / 8)) * 8 + 1

/**
 * A clip's size for a picture's: its shape, with about as many pixels as 1280×704 (the size
 * measured on the PC, docs/research/video-models.md), each side a multiple of 32, as LTX needs.
 */
export function clipSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.sqrt((1280 * 704) / (width * height))
  const side = (n: number) => Math.max(32, Math.round((n * scale) / 32) * 32)
  return { width: side(width), height: side(height) }
}
