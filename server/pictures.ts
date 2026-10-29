import { join } from '@std/path'
import type { Figure } from './3d/figure.ts'
import type { Scene } from './3d/scene.ts'
import type { Clip } from './video/makeClip.ts'
import { anyImageModel, type ImageBackendKind } from './images/imageModels.ts'
import type { Session, SessionStore } from './session.ts'
import { updateSession } from './update.ts'

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
  /** Clips made from it, one of each kind, once asked for (`video/makeClip.ts`). */
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
 * straight line, and `picked` says which version is the picture (`pickedVersion`).
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
  /** Its edits, oldest first, each made from the one before. */
  edits?: PictureEdit[]
  /** The version that is the picture everywhere: 0 (or none) for the render, n for edit n. */
  picked?: number
}

/** The version of a picture that is the picture: its picked edit, or its render. */
export const pickedVersion = (p: Picture): PictureVersion =>
  (p.picked && p.edits?.[p.picked - 1]) || p

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

/** The version of its picture Frame `index` of `session` uses, if it has a picture. */
export const shownVersionOf = (session: Session, index: number): PictureVersion | undefined => {
  const picture = shownPictureOf(session, index)
  return picture && pickedVersion(picture)
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

/** Whether `image` is one of a picture's versions: its render or an edit. */
const hasImage = (p: Picture, image: string) =>
  p.image === image || !!p.edits?.some((e) => e.image === image)

/**
 * `pictures` with the version whose image is `image` (a render or an edit) changed by `change`.
 * Throws `PictureGoneError` if it's no longer there (rendered again meanwhile, its edit deleted,
 * or its Frame undone).
 */
export function changePicture(
  pictures: Picture[],
  image: string,
  change: <V extends PictureVersion>(v: V) => V,
): Picture[] {
  if (!pictures.some((p) => hasImage(p, image))) {
    throw new PictureGoneError('That picture changed')
  }
  return pictures.map((p) =>
    p.image === image
      ? change(p)
      : p.edits?.some((e) => e.image === image)
      ? { ...p, edits: p.edits.map((e) => (e.image === image ? change(e) : e)) }
      : p
  )
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
  change: <V extends PictureVersion>(v: V) => V,
): S {
  const frame = session.frames.find((f) => f.pictures.some((p) => hasImage(p, image)))
  if (!frame) throw new PictureGoneError('That picture no longer exists')
  const pictures = changePicture(frame.pictures, image, change)
  return {
    ...session,
    frames: session.frames.map((f) => (f === frame ? { ...f, pictures } : f)),
  } as S
}

/**
 * `session` with the picture whose render is `image` changed by `change`, as a whole (its edits,
 * which it picks), saving onto the Session as it is now. Throws `PictureGoneError` if it's gone.
 */
export function changeRenderedPicture<S extends Session>(
  session: S,
  image: string,
  change: (p: Picture) => Picture,
): S {
  const frame = session.frames.find((f) => f.pictures.some((p) => p.image === image))
  if (!frame) throw new PictureGoneError('That picture no longer exists')
  const pictures = frame.pictures.map((p) => (p.image === image ? change(p) : p))
  return {
    ...session,
    frames: session.frames.map((f) => (f === frame ? { ...f, pictures } : f)),
  } as S
}

/** Pictures marked out of date, after the Image Prompt they were rendered from changed. */
export const allStale = (pictures: Picture[]): Picture[] =>
  pictures.map((p) => ({ ...p, stale: true }))

/** The files a version of a picture is made of: the image, its upscale, scene, figures and clips. */
export const versionFiles = (v: PictureVersion): string[] =>
  [
    v.image,
    v.upscaled,
    v.scene?.file,
    v.figure?.file,
    v.lito?.file,
    ...(v.clips ?? []).map((c) => c.file),
  ]
    .filter((f): f is string => !!f)

/** The files a picture is made of: its render's, and each edit's with its painted area. */
export const pictureFiles = (p: Picture): string[] => [
  ...versionFiles(p),
  ...(p.edits ?? []).flatMap((e) => [...versionFiles(e), ...(e.mask ? [e.mask] : [])]),
]

/** Every file of every picture a Frame holds. */
export const allPictureFiles = (frame: PicturedFrame): string[] =>
  frame.pictures.flatMap(pictureFiles)

/** Deletes `files` from a Session's directory, ignoring any already gone. */
export async function removeFiles(dir: string, files: string[]): Promise<void> {
  for (const file of files) await Deno.remove(join(dir, file)).catch(() => {})
}

export class ImageModelError extends Error {}

/**
 * Switches a Session to Image Model `model`, rendering on `backend`'s kind if it's picked there
 * (mflux or ComfyUI, a preference: ADR 0022), resetting the steps to its default there (the seed,
 * size and everything else stay). Each Frame then shows its picture by that model if it has one
 * (`shownPicture`): by its name, whichever backend made it. Renders already under way finish on
 * the model they started with; later ones use the new one.
 */
export async function switchImageModel(
  store: SessionStore,
  session: Session,
  model: string,
  backend?: ImageBackendKind,
): Promise<Session> {
  const option = anyImageModel(model, backend)
  if (!option) throw new ImageModelError(`There's no Image Model "${model}"`)
  return await updateSession(store, session.id, session.kind, (latest: Session) => {
    const { imageModel, imageBackend, ...rest } = latest.settings
    if (imageModel === model && imageBackend === backend) return latest
    return {
      ...latest,
      settings: {
        ...rest,
        imageModel: model,
        // The same model on another backend keeps its steps; another model starts at its own.
        steps: imageModel === model ? latest.settings.steps : option.defaultSteps,
        ...(backend && { imageBackend: backend }),
      },
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
