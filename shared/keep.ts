/**
 * What to keep of a Session, for an export or Remove the rest (the Session manager's ticks). Shared
 * by the server and the web app: types and plain values only.
 */
import type { ClipKind } from './clips.ts'
import type { Session } from './session.ts'

export const THREE_D_KINDS = ['scene', 'figure', 'lito'] as const
export type ThreeDKind = (typeof THREE_D_KINDS)[number]
export const THREE_D_LABELS: Record<ThreeDKind, string> = {
  scene: 'SHARP scenes',
  figure: 'TripoSplat figures',
  lito: 'LiTo figures',
}

export const SOUND_KINDS = ['speech', 'voices', 'cues'] as const
export type SoundKind = (typeof SOUND_KINDS)[number]
export const SOUND_LABELS: Record<SoundKind, string> = {
  speech: 'Speech and thoughts',
  voices: 'Voices',
  cues: 'Music cues',
}

/**
 * What's left out: the ticks taken off. Whatever isn't named here is kept, so work finished after
 * the ticks were shown is kept, never removed unasked. The Frames and their text always stay.
 */
export interface LeftOut {
  /** Image Models whose pictures go, with everything made from them. */
  imageModels: string[]
  upscales: boolean
  /** Every edit, with its painted area; a picked edit's picture goes back to its render. */
  edits: boolean
  /**
   * Per Frame, only the picture it shows now: the Session's Image Model's, at its picked version,
   * which becomes its Original (its other versions dropped). A Frame without one by that model is
   * left without a picture.
   */
  chosenOnly: boolean
  /** Per video model, the kinds of clip that go. */
  clips: Record<string, ClipKind[]>
  threeD: ThreeDKind[]
  sound: SoundKind[]
  calls: boolean
}

/** Nothing left out: every tick on. */
export const KEEP_ALL: LeftOut = {
  imageModels: [],
  upscales: false,
  edits: false,
  chosenOnly: false,
  clips: {},
  threeD: [],
  sound: [],
  calls: false,
}

/** How many of something there are, and their bytes on disk. */
export interface Amount {
  count: number
  size: number
}

/** What there is to keep or leave out, each with how much it is on its own (`GET …/keep`). */
export interface KeepOptions {
  /** The Session's own Image Model, whose pictures Chosen picture only keeps. */
  imageModel: string
  /** Each with its size counting what's made from its pictures, and `pictures`, their images alone. */
  imageModels: (Amount & { model: string; pictures: number })[]
  upscales: Amount
  /** Edits with their painted areas. */
  edits: Amount
  /** The pictures Chosen picture only keeps (one per Frame at most), and their images' size. */
  chosen: Amount
  clips: { model: string; kinds: (Amount & { kind: ClipKind })[] }[]
  threeD: (Amount & { kind: ThreeDKind })[]
  sound: (Amount & { kind: SoundKind })[]
  calls: Amount
}

/**
 * What a choice of ticks keeps (`POST …/keep`): the bytes kept and left out, and what there would
 * still be of each option once the pictures left out have taken what was made from them (an
 * option with none left greys out).
 */
export interface KeepPreview {
  kept: number
  leftOut: number
  /** The options as they'd be after the pictures' ticks alone. */
  after: KeepOptions
}

/** Remove the rest's answer: the Session as it's left, and the bytes freed. */
export interface Removed {
  session: Session
  freed: number
}
