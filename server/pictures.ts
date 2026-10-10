import { join } from '@std/path'
import type { Figure } from './3d/figure.ts'
import type { Scene } from './3d/scene.ts'
import { findImageModel } from './images/imageModels.ts'
import type { Session, SessionStore } from './session.ts'
import { updateSession } from './update.ts'

/**
 * A Frame's picture by one Image Model, and what was made from it. A Frame keeps one per model it
 * was rendered with, so switching the Session's model back shows that model's again without
 * rendering.
 */
export interface Picture {
  /** File name of the image inside the Session directory. */
  image: string
  /** The Image Model that rendered it. */
  imageModel: string
  /** The image upscaled to 2048 px, once upscaled. */
  upscaled?: string
  /** The Image Prompt changed since it was rendered. */
  stale?: boolean
  /** The picture made into a 2.5D scene (SHARP), once asked for. */
  scene?: Scene
  /** The person in the picture as a 3D figure (TripoSplat), once asked for. */
  figure?: Figure
  /** The same, made with Apple's LiTo. */
  lito?: Figure
  /** Seconds the render waited for another (only if it had to) and took. */
  timings?: { queued?: number; image: number }
}

/** A Frame of any kind, as far as its pictures go. */
export interface PicturedFrame {
  index: number
  /** One per Image Model it was rendered with, oldest first; none until rendered. */
  pictures: Picture[]
}

/**
 * The picture a Frame shows: its picture by `model` (the Session's), or else its latest, which is
 * then changed since render (`changedSinceRender`).
 */
export const shownPicture = (frame: PicturedFrame, model: string): Picture | undefined =>
  frame.pictures.find((p) => p.imageModel === model) ?? frame.pictures.at(-1)

/** The picture Frame `index` of `session` shows, if it has one. */
export const shownPictureOf = (session: Session, index: number): Picture | undefined => {
  const frame = session.frames[index]
  return frame && shownPicture(frame, session.settings.imageModel)
}

/** A picture's Image Prompt changed since it was rendered, or it's by another Image Model. */
export const changedSinceRender = (picture: Picture, model: string): boolean =>
  !!picture.stale || picture.imageModel !== model

/**
 * `pictures` with `picture` in place of the one by the same model, as the latest. Returns the one
 * it replaced too, whose files are then to be deleted.
 */
export function withPicture(
  pictures: Picture[],
  picture: Picture,
): { pictures: Picture[]; replaced?: Picture } {
  const replaced = pictures.find((p) => p.imageModel === picture.imageModel)
  return { pictures: [...pictures.filter((p) => p !== replaced), picture], replaced }
}

/**
 * `pictures` with the one whose image is `image` changed by `change`. Throws `PictureGoneError`
 * if it's no longer there (rendered again meanwhile, or its Frame undone).
 */
export function changePicture(
  pictures: Picture[],
  image: string,
  change: (p: Picture) => Picture,
): Picture[] {
  if (!pictures.some((p) => p.image === image)) throw new PictureGoneError('That picture changed')
  return pictures.map((p) => (p.image === image ? change(p) : p))
}

export class PictureGoneError extends Error {}

/**
 * `session` with the picture of Frame `index` whose image is `image` changed by `change`, for work
 * made from a picture (an upscale, 3D) saving onto the Session as it is now. Throws
 * `PictureGoneError` if that Frame or picture is gone.
 */
export function changeFramePicture<S extends Session>(
  session: S,
  index: number,
  image: string,
  change: (p: Picture) => Picture,
): S {
  const frame = session.frames[index]
  if (!frame) throw new PictureGoneError('That Frame no longer exists')
  const pictures = changePicture(frame.pictures, image, change)
  return {
    ...session,
    frames: session.frames.map((f) => (f.index === index ? { ...f, pictures } : f)),
  } as S
}

/** Pictures marked out of date, after the Image Prompt they were rendered from changed. */
export const allStale = (pictures: Picture[]): Picture[] =>
  pictures.map((p) => ({ ...p, stale: true }))

/** The files a picture is made of: the image, and its upscale, scene and figures. */
export const pictureFiles = (p: Picture): string[] =>
  [p.image, p.upscaled, p.scene?.file, p.figure?.file, p.lito?.file].filter((f): f is string => !!f)

/** Every file of every picture a Frame holds. */
export const allPictureFiles = (frame: PicturedFrame): string[] =>
  frame.pictures.flatMap(pictureFiles)

/** Deletes `files` from a Session's directory, ignoring any already gone. */
export async function removeFiles(dir: string, files: string[]): Promise<void> {
  for (const file of files) await Deno.remove(join(dir, file)).catch(() => {})
}

export class ImageModelError extends Error {}

/**
 * Switches a Session to Image Model `model` of its Image backend, resetting the steps to that
 * model's default (the seed, size and everything else stay). Each Frame then shows its picture by
 * that model if it has one (`shownPicture`). Renders already under way finish on the model they
 * started with; later ones use the new one.
 */
export async function switchImageModel(
  store: SessionStore,
  session: Session,
  model: string,
): Promise<Session> {
  const option = findImageModel(session.settings.imageBackend, model)
  if (!option) {
    throw new ImageModelError(`${session.settings.imageBackend} has no Image Model "${model}"`)
  }
  return await updateSession(
    store,
    session.id,
    session.kind,
    (latest: Session) =>
      latest.settings.imageModel === model ? latest : {
        ...latest,
        settings: { ...latest.settings, imageModel: model, steps: option.defaultSteps },
      },
  )
}
