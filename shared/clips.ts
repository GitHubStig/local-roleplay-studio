/**
 * Clips: their kinds, sizes and orders. Shared by the server and the web app: types and plain
 * values only.
 */

/**
 * A Frame's picture as a short clip (ADR 0025). Where the picture sits in the clip is the
 * kind of clip, as a picture shows the middle of what its Frame describes: a clip can lead up to
 * it, go on from it, or move a little and come back to it.
 */
export type ClipKind = 'lead-in' | 'play-out' | 'idle-loop' | 'into-next'

/** A clip's size: Small (~0.4 MP, faster) or Large (the model's trained size, ~0.9 MP). */
export type ClipSize = 'small' | 'large'

/**
 * What a `clip` is told (ADR 0025): its kind, what happens in it (the movement, the
 * camera, the sound), how many seconds it lasts, whether anyone may speak in it, and the video
 * model that makes it (Settings' default if none, read as it starts).
 */
export interface ClipOrder {
  kind: ClipKind
  prompt: string
  seconds: number
  speech: boolean
  model?: string
}

/** A clip as asked for, before its prompt is written: its kind, length and speech. */
export type ClipAsk = Omit<ClipOrder, 'prompt' | 'model'>

/**
 * A clip made from a picture (ADR 0025), kept on the picture version it was made from:
 * one of each kind by each video model, a new one replacing that model's old one.
 */
export interface Clip {
  kind: ClipKind
  /** The video model that made it (`comfyui/models.ts`). */
  model: string
  /** File name of the clip (an MP4) inside the Session directory. */
  file: string
  /** What it was told happens, and whether anyone could speak. */
  prompt: string
  speech: boolean
  seconds: number
  seed: number
  /** Into Next's last picture: the next Frame's image it ends on. */
  next?: string
  /** Seconds it waited for another render (only if it had to) and took. */
  timings: { queued?: number; clip: number }
}
