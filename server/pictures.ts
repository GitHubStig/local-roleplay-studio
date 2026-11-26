import { join } from '@std/path'
import { anyImageModel } from './images/imageModels.ts'
import type { ImageBackendKind } from '../shared/images.ts'
import type { SessionStore } from './session.ts'
import type { Session } from '../shared/session.ts'
import { updateSession } from './update.ts'
import { Refusal } from './refusal.ts'
import type { FacePass, Picture, PictureEdit, PictureVersion } from '../shared/pictures.ts'

/** The version of a picture that is the picture: its picked edit, or its render. */
export const pickedVersion = (p: Picture): PictureVersion =>
  (p.picked && p.edits?.[p.picked - 1]) || p

/** A picture's edits by edit model `model`, oldest first: a line of its own from the Original. */
export const editLine = (p: Picture, model: string): PictureEdit[] =>
  (p.edits ?? []).filter((e) => e.editModel === model)

/** A picture's version a new edit by `model` is made from: that model's newest, or the Original. */
export const editSource = (p: Picture, model: string): PictureVersion =>
  editLine(p, model).at(-1) ?? p

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

/**
 * `image` is a version of this picture: its render, one of its edits, or one a face pass keeps
 * beside them.
 */
const hasVersion = (p: Picture, image: string): boolean =>
  [p, ...(p.edits ?? [])].some((v) => v.file === image || v.faces?.other?.file === image)

const inSession = (session: Session, image: string): boolean =>
  (session.frames as PicturedFrame[]).some((f) => f.pictures.some((p) => hasVersion(p, image)))

/**
 * The image that shows a Session on Home: the one chosen, for as long as it exists, whichever
 * Image Model made it; or else the newest Frame's picture.
 */
export function homeImage(session: Session): string | null {
  const chosen = session.thumbnail
  if (chosen && inSession(session, chosen)) return chosen
  return (session.frames as PicturedFrame[]).map((f) => {
    const picture = shownPicture(f, session.settings.imageModel)
    return picture && pickedVersion(picture).file
  }).findLast((image) => image) ?? null
}

/** Chooses `image` to show the Session on Home, or with null goes back to the newest picture. */
export function chooseThumbnail(
  store: SessionStore,
  session: Session,
  image: string | null,
): Promise<Session> {
  return updateSession(store, session.id, session.kind, (latest: Session) => {
    if (image === null) {
      const { thumbnail: _, ...rest } = latest
      return rest as Session
    }
    if (!inSession(latest, image)) throw new PictureGoneError('That picture no longer exists')
    return { ...latest, thumbnail: image }
  })
}

/** Throws `ImageModelError` if `model` is the Session's own: its pictures can't be deleted. */
export function refuseOwnModel(session: Session, model: string) {
  if (session.settings.imageModel !== model) return
  throw new ImageModelError(
    `${model} is this Session's Image Model: switch to another before deleting its pictures`,
    409,
  )
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
  p.file === image || !!p.edits?.some((e) => e.file === image)

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
    p.file === image
      ? change(p)
      : p.edits?.some((e) => e.file === image)
      ? { ...p, edits: p.edits.map((e) => (e.file === image ? change(e) : e)) }
      : p
  )
}

export class PictureGoneError extends Refusal {}

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
  const frame = session.frames.find((f) => f.pictures.some((p) => p.file === image))
  if (!frame) throw new PictureGoneError('That picture no longer exists')
  const pictures = frame.pictures.map((p) => (p.file === image ? change(p) : p))
  return {
    ...session,
    frames: session.frames.map((f) => (f === frame ? { ...f, pictures } : f)),
  } as S
}

/** A version's own fields, taken from a picture: its image and what was made from it. */
export const versionOf = (
  { file, upscaled, scene, figure, lito, clips }: PictureVersion,
): PictureVersion => ({
  file,
  ...(upscaled && { upscaled }),
  ...(scene && { scene }),
  ...(figure && { figure }),
  ...(lito && { lito }),
  ...(clips && { clips }),
})

/** A version that may have had a face pass: a render (a Picture) or an edit. */
type Faced = PictureVersion & { faces?: FacePass }

/**
 * A render or an edit with its face pass's two versions swapped, each keeping what was made from
 * it: the picture before the pass in use ("Without the face pass"), or the faces again. Unchanged
 * without both versions (the one before left out by the Session manager).
 */
export function swapFaces<V extends Faced>(v: V): V {
  if (!v.faces?.other) return v
  const { file: _, upscaled: __, scene: ___, figure: ____, lito: _____, clips: ______, ...rest } = v
  const { other, ...pass } = v.faces
  return { ...rest, ...other, faces: { ...pass, without: !pass.without, other: versionOf(v) } } as V
}

/**
 * The seed a version's image was made with, for what's made from it to be one on (ADR 0011): its
 * face pass's last edit's while its faces are in use, else its own edit's, else the Session's
 * (`render`), which a render is made with.
 */
export const seedOf = (v: Faced & { seed?: number }, render: number): number =>
  v.faces && !v.faces.without ? v.faces.seed : v.seed ?? render

/** Pictures marked out of date, after the Image Prompt they were rendered from changed. */
export const allStale = (pictures: Picture[]): Picture[] =>
  pictures.map((p) => ({ ...p, stale: true }))

/** The files a version of a picture is made of: the image, its upscale, scene, figures and clips. */
export const versionFiles = (v: PictureVersion): string[] =>
  [
    v.file,
    v.upscaled,
    v.scene?.file,
    v.figure?.file,
    v.lito?.file,
    ...(v.clips ?? []).map((c) => c.file),
  ]
    .filter((f): f is string => !!f)

/** The files of a version and of the one its face pass keeps beside it. */
const facedFiles = (v: Faced): string[] => [
  ...versionFiles(v),
  ...(v.faces?.other ? versionFiles(v.faces.other) : []),
]

/** The files an edit is made of: its own (and the one its face pass keeps), and its painted area. */
export const editFiles = (e: PictureEdit): string[] => [
  ...facedFiles(e),
  ...(e.mask ? [e.mask] : []),
]

/**
 * The files a picture is made of: its render's (the face pass's, and the render kept before it), and
 * each edit's with its painted area.
 */
export const pictureFiles = (p: Picture): string[] => [
  ...facedFiles(p),
  ...(p.edits ?? []).flatMap(editFiles),
]

/** Every file of every picture a Frame holds. */
export const allPictureFiles = (frame: PicturedFrame): string[] =>
  frame.pictures.flatMap(pictureFiles)

/** Deletes `files` from a Session's directory, ignoring any already gone. */
export async function removeFiles(dir: string, files: string[]): Promise<void> {
  for (const file of files) await Deno.remove(join(dir, file)).catch(() => {})
}

export class ImageModelError extends Refusal {
  static override status = 400
}

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
