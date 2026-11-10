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
