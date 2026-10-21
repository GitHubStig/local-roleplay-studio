import { join } from '@std/path'
import type { Figure } from './3d/figure.ts'
import type { Scene } from './3d/scene.ts'
import { findImageModel, type ImageBackendKind } from './images/imageModels.ts'
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
  /**
   * The Image backend it ran on. Pictures from before a Session could switch backend lack it: they
   * were by the Session's backend, which `switchImageModel` writes onto them before it changes.
   */
  imageBackend?: ImageBackendKind
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
 * `session` with its picture whose image is `image` changed by `change`, for work made from a
 * picture (an upscale, 3D) saving onto the Session as it is now. Found by its image, whose name is
 * never reused, so it's found even after Frames before it were deleted. Throws `PictureGoneError`
 * if that picture is gone.
 */
export function changeFramePicture<S extends Session>(
  session: S,
  image: string,
  change: (p: Picture) => Picture,
): S {
  const frame = session.frames.find((f) => f.pictures.some((p) => p.image === image))
  if (!frame) throw new PictureGoneError('That picture no longer exists')
  const pictures = changePicture(frame.pictures, image, change)
  return {
    ...session,
    frames: session.frames.map((f) => (f === frame ? { ...f, pictures } : f)),
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
 * Switches a Session to Image Model `model` of Image backend `backend` (its own by default),
 * resetting the steps to that model's default (the seed, size and everything else stay). Each Frame
 * then shows its picture by that model if it has one (`shownPicture`): by its name, whichever
 * backend made it, so the same model on another backend needs no render. Renders already under way
 * finish on the model and backend they started with; later ones use the new ones.
 */
export async function switchImageModel(
  store: SessionStore,
  session: Session,
  model: string,
  backend: ImageBackendKind = session.settings.imageBackend,
): Promise<Session> {
  const option = findImageModel(backend, model)
  if (!option) throw new ImageModelError(`${backend} has no Image Model "${model}"`)
  return await updateSession(store, session.id, session.kind, (latest: Session) => {
    const { imageBackend, imageModel } = latest.settings
    if (imageModel === model && imageBackend === backend) return latest
    return {
      ...latest,
      settings: {
        ...latest.settings,
        imageBackend: backend,
        imageModel: model,
        steps: option.defaultSteps,
      },
      frames: imageBackend === backend ? latest.frames : latest.frames.map((f) => ({
        ...f,
        pictures: f.pictures.map((p) => (p.imageBackend ? p : { ...p, imageBackend })),
      })),
    } as Session
  })
}

/**
 * Deletes every picture Image Model `model` made in the Session, with what was made from them
 * (upscales, scenes, figures), from Compare's hidden columns: for a model whose pictures aren't
 * worth keeping. Not the Session's own Image Model, which every Frame shows: switch first. Says how
 * many pictures went. A render by that model still under way (started before a switch) would add
 * its picture back when it finishes.
 */
export async function deleteModelPictures(
  store: SessionStore,
  session: Session,
  model: string,
): Promise<{ session: Session; deleted: number }> {
  let files: string[] = []
  let deleted = 0
  const updated = await updateSession(store, session.id, session.kind, (latest: Session) => {
    if (latest.settings.imageModel === model) {
      throw new ImageModelError(
        `${model} is this Session's Image Model: switch to another before deleting its pictures`,
      )
    }
    const gone = latest.frames.flatMap((f) => f.pictures.filter((p) => p.imageModel === model))
    files = gone.flatMap(pictureFiles)
    deleted = gone.length
    return {
      ...latest,
      frames: latest.frames.map((f) => ({
        ...f,
        pictures: f.pictures.filter((p) => p.imageModel !== model),
      })),
    } as Session
  })
  await removeFiles(store.dir(session.id), files)
  return { session: updated, deleted }
}
