/** A Frame's pictures: one per Image Model, each with its edits and what was made from it. Shared by the server and the web app: types and plain values only. */
import type { Clip } from './clips.ts'
import type { ImageBackendKind } from './images.ts'
import type { Figure, Scene } from './threeD.ts'

/** A picture's image and what was made from it: its render, or an edit of it (ADR 0021). */
export interface PictureVersion {
  /** File name of the image inside the Session directory. */
  image: string
  /** The image upscaled to 2048 px, once upscaled. */
  upscaled?: string
  /** The picture made into a 2.5D scene (SHARP), once asked for. */
  scene?: Scene
  /** The person in the picture as a 3D figure (TripoSplat), once asked for. */
  figure?: Figure
  /** The same, made with Apple's LiTo. */
  lito?: Figure
  /** Clips made from it, one of each kind per video model, once asked for (`video/makeClip.ts`). */
  clips?: Clip[]
}

/** A picture's edit: a version made from the one before it by an edit model, as told. */
export interface PictureEdit extends PictureVersion {
  /**
   * What the edit model was told to paint: one, or every one that led to it when it was copied
   * from a later edit (a Chain made from a Storyboard).
   */
  instructions: string[]
  /** The edit model (`images/editModels.ts`). */
  editModel: string
  /** The kind of backend that made it, as a Picture says what rendered it. */
  imageBackend?: ImageBackendKind
  seed: number
  /** The area painted over the picture to repaint (a PNG, white repainted); none for all of it. */
  mask?: string
  /** Copied from another Session, so it can't be made again (retried) here. */
  copied?: boolean
  /** Seconds the edit waited for another render (only if it had to) and took. */
  timings?: { queued?: number; edit: number }
}

/**
 * A Frame's picture by one Image Model, and what was made from it. A Frame keeps one per model it
 * was rendered with, so switching the Session's model back shows that model's again without
 * rendering. Its own files are its render's (the Original); its edits, if any, follow in a
 * straight line per edit model, each line starting from the Original (`editLine`), and `picked`
 * says which version is the picture (`pickedVersion`).
 */
export interface Picture extends PictureVersion {
  /** The Image Model that rendered it. */
  imageModel: string
  /**
   * The Image backend it ran on. Pictures from before a Session could switch backend lack it: they
   * were by the Session's backend, which `switchImageModel` writes onto them before it changes.
   */
  imageBackend?: ImageBackendKind
  /** The Image Prompt changed since it was rendered. */
  stale?: boolean
  /** Seconds the render waited for another (only if it had to) and took. */
  timings?: { queued?: number; image: number }
  /** Its edits, oldest first, each made from the one before by the same edit model. */
  edits?: PictureEdit[]
  /** The version that is the picture everywhere: 0 (or none) for the render, n for `edits[n - 1]`. */
  picked?: number
}
