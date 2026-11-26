import { join } from '@std/path'
import { imageKindOf } from './backends.ts'
import type { Backend } from '../shared/backends.ts'
import {
  changeFramePicture,
  changeRenderedPicture,
  pictureFiles,
  removeFiles,
  shownVersionOf,
  swapFaces,
  withPicture,
} from './pictures.ts'
import {
  type FaceWay,
  NO_ONE_WITH_A_SHEET,
  NO_ONE_WITH_A_SHEET_EDITED,
  shownSheets,
} from './faces/facePass.ts'
import type { FacePass, Picture } from '../shared/pictures.ts'
import type { ImageGenerator, ImageSize } from './images/imageGenerator.ts'
import { anyImageModel } from './images/imageModels.ts'
import type { Upscaler } from '../shared/images.ts'
import type { TextModel } from './textModel.ts'
import type { Previews } from './previews.ts'
import type { HeavyJob } from './machine.ts'
import { RenderQueue } from './renderQueue.ts'
import type { SessionStore } from './session.ts'
import type { Session, StoryboardFrame } from '../shared/session.ts'
import type { RoleplayImage } from '../shared/roleplay.ts'
import { DEFAULT_SETTINGS, renderSettings } from './settings.ts'
import type { Settings } from '../shared/settings.ts'
import { GoneError } from './update.ts'
import { ContextFullError } from './text/chat.ts'
import { Refusal } from './refusal.ts'
import type { ProgressEvent } from '../shared/events.ts'

/**
 * Image Model progress as events: `download` while the model downloads, then `image` again with
 * the steps once it renders.
 */
export function imageProgress(emit: (event: ProgressEvent) => void) {
  let downloading = false
  return {
    onProgress: (step: number, total: number) => {
      if (downloading) emit({ type: 'phase', phase: 'image' })
      downloading = false
      emit({ type: 'progress', step, total })
    },
    onDownload: () => {
      if (!downloading) emit({ type: 'phase', phase: 'download' })
      downloading = true
    },
  }
}

/** Progress of an upscale; ends with the Session, the Frame now upscaled. */
export type UpscaleEvent = ProgressEvent | { type: 'upscaled'; session: Session }

export interface FrameDeps {
  store: SessionStore
  textModel: TextModel
  imageGenerator: ImageGenerator
  /** Shared across Sessions so only one image renders at a time. */
  renderQueue?: RenderQueue
  /** Where a render's previews go, as the picture forms (ComfyUI's). */
  previews?: Previews
  /** Settings as they are now, for how a render runs (`renderSettings`); else the Session's own. */
  settings?: () => Promise<Settings>
  /** The Backend a heavy job goes to now (`backendOf`); left out, the image generator finds it. */
  backendOf?: (job: HeavyJob) => Promise<Backend | undefined>
  /** How faces are repainted from reference sheets after a render; none where heads can't be found. */
  faces?: FaceWay
}

/** What rendering a picture needs: a Roleplay renders with these, its text going through its own model. */
export type RenderDeps = Omit<FrameDeps, 'textModel'>

const TEXT_ATTEMPTS = 2

/** Seconds since `start` (a `performance.now()` reading), to one decimal place. */
/**
 * What Frame `index` is called wherever a person reads it, the same in every kind of Session:
 * numbered from 1, so index 0 (a Chain's or a Roleplay's Opening) is Frame 1. Not in what the
 * Text Model is told, which keeps its own numbering.
 */
export const frameName = (index: number) => `Frame ${index + 1}`

export const secondsSince = (start: number) => Math.round((performance.now() - start) / 100) / 10

/**
 * A fresh image file name (without extension) for Frame `index`. The random suffix means a name is
 * never reused after an Undo, so a browser can cache images forever without showing a stale one.
 */
export const imageName = (index: number) => `frame-${index}-${crypto.randomUUID().slice(0, 8)}`

/**
 * The Frame that was at `index`, made at `createdAt`, when work on it began: there still, or moved
 * down after Frames before it were deleted. Two Frames can share a millisecond, so of those made
 * then, the last at or before `index`. Undefined if it's gone.
 */
export function followFrame<F extends { index: number; createdAt: string }>(
  frames: readonly F[],
  index: number,
  createdAt: string,
): F | undefined {
  return frames.findLast((f) => f.createdAt === createdAt && f.index <= index)
}

/**
 * Runs a Text Model call, retrying once if its reply is unusable. Streams the model's reasoning as
 * `thinking` events, marking a retry's first chunk as a restart.
 */
export async function withRetry<T>(
  call: (onThinking: (chunk: string) => void) => Promise<T>,
  signal: AbortSignal,
  emit: (event: ProgressEvent) => void,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= TEXT_ATTEMPTS; attempt++) {
    let restart = attempt > 1
    try {
      return await call((text) => {
        emit({ type: 'thinking', text, ...(restart ? { restart } : {}) })
        restart = false
      })
    } catch (err) {
      if (signal.aborted || err instanceof ContextFullError) throw err
      lastError = err
      console.warn(
        `Text Model attempt ${attempt} of ${TEXT_ATTEMPTS} failed:`,
        (err as Error).message,
      )
    }
  }
  throw lastError
}

/** What a render may have of its own, rather than its Session's: a reference sheet's. */
export interface RenderOwn {
  /** Its seed; the Session's otherwise. */
  seed?: number
  /** Its size; Settings' otherwise. */
  size?: ImageSize
  /** Its Image Model, at that model's own steps; the Session's otherwise. */
  imageModel?: string
}

/**
 * Renders `prompt` into `<dir>/<name>.png` with the Session's Image Model, through the shared
 * render queue, run as Settings are now (`renderSettings`). Returns the picture, with how long it
 * waited and how long it rendered.
 */
export async function renderImage(
  deps: RenderDeps,
  session: Session,
  prompt: string,
  name: string,
  emit: (event: ProgressEvent) => void,
  signal: AbortSignal,
  own: RenderOwn = {},
): Promise<Picture> {
  const sessions = renderSettings(
    session.settings,
    deps.settings ? await deps.settings() : DEFAULT_SETTINGS,
  )
  const other = own.imageModel && own.imageModel !== sessions.imageModel
  const settings = other
    ? {
      ...sessions,
      imageModel: own.imageModel!,
      steps: anyImageModel(own.imageModel!)?.defaultSteps ?? sessions.steps,
    }
    : sessions
  // Found once, so the picture records where it was made.
  const on = other ? undefined : session.settings.imageBackend
  const job: HeavyJob = { kind: 'render', model: settings.imageModel, ...(on && { on }) }
  const backend = await deps.backendOf?.(job)
  const kind = backend && imageKindOf(backend)
  const queueStart = performance.now()
  let waited = false
  const release = await (deps.renderQueue ?? new RenderQueue()).acquire(signal, () => {
    waited = true
    emit({ type: 'phase', phase: 'queued' })
  }, { job })
  const queued = waited ? secondsSince(queueStart) : undefined
  const imageStart = performance.now()
  try {
    emit({ type: 'phase', phase: 'image', ...(kind && { imageBackend: kind }) })
    const dir = deps.store.dir(session.id)
    await Deno.mkdir(dir, { recursive: true })
    const { onProgress, onDownload } = imageProgress(emit)
    const image = await deps.imageGenerator.generate(
      {
        prompt,
        seed: own.seed ?? session.seed,
        settings,
        dir,
        name,
        ...(backend && { backend }),
        ...(own.size && { size: own.size }),
      },
      signal,
      onProgress,
      onDownload,
      deps.previews && ((jpeg) => deps.previews!.set(session.id, jpeg)),
    )
    return {
      file: image,
      imageModel: settings.imageModel,
      ...(kind && { imageBackend: kind }),
      timings: { ...(queued !== undefined && { queued }), image: secondsSince(imageStart) },
    }
  } finally {
    deps.previews?.clear(session.id)
    release()
  }
}

/** Who a Frame shows and how they look, for its face pass (`passFaces`). */
export interface FacesOf {
  /** The Look's Subjects it shows, by name, the most prominent first. */
  shown: string[]
  /** Its expression sentence, '' when not known. */
  expression: string
  /** What its clothing sentence says each person has on, marks included: a Roleplay Frame's. */
  worn?: string
}

/**
 * Who Frame `index` shows and how they look, for the face pass of an edit of its picture: a
 * Storyboard's from its plan, a Roleplay's from its Art Agent; none for a Chain, which has no sheets,
 * or a Frame not yet written.
 */
export function facesOfFrame(session: Session, index: number): FacesOf | undefined {
  if (session.kind === 'chain') return undefined
  const frame = session.frames[index]
  if (!frame?.image) return undefined
  if (session.kind === 'roleplay') {
    const image = frame.image as RoleplayImage
    return { shown: image.shown, expression: image.expression, worn: image.clothing }
  }
  return { shown: (frame as StoryboardFrame).shown, expression: frame.image.expression }
}

/** What the face pass is given of a picture just made and saved: a render, or an edit. */
export interface MadeForFaces {
  /** Its image, a PNG in the Session's folder. */
  file: string
  /** The seed it was made with. */
  seed: number
  /** It's an edit. */
  edited?: boolean
  /** An edit made from a version whose face pass is in use (`FacesRequest.again`). */
  again?: boolean
  /** An edit's painted area: only the heads it touches are repainted. None for all of the picture. */
  area?: string
  /** What an edit was told, for its face pass to keep (`face-edited.md`): an edit of a painted area's. */
  change?: string
}

/**
 * The face pass of a picture just made and saved (`made`, a render or an edit of Frame `index`), in
 * a Storyboard or a Roleplay with reference sheets: the faces of the ticked Subjects it shows
 * (`faces`) repainted from their sheets, then saved onto it with `onto` (the Session as it is now,
 * and the pass, its `other` the picture before), so it keeps both. Answers the Session as saved, or
 * undefined where it left the picture as it was: a Session without sheets, or (saying why, as a
 * `faces` step) one showing no one with a sheet, whose heads weren't found, or an edit that touched
 * no face. A failure or a Cancel leaves the picture as it was too.
 */
export async function passFaces<S extends Session>(
  deps: Pick<FrameDeps, 'store' | 'faces'>,
  session: S,
  index: number,
  made: MadeForFaces,
  faces: FacesOf,
  emit: (event: ProgressEvent) => void,
  signal: AbortSignal,
  save: (change: (s: S) => S) => Promise<S>,
  onto: (latest: S, pass: FacePass) => S,
): Promise<S | undefined> {
  if (session.kind === 'chain' || !session.settings.sheets) return undefined
  const as = made.edited ? 'edited' : 'rendered'
  const skip = (skipped: string, untouched?: boolean) => {
    emit({ type: 'faces', faces: { subjects: [], skipped, ...(untouched && { untouched }) } })
    return undefined
  }
  const sheets = shownSheets(session.sheets, faces.shown)
  if (!sheets.length) return skip(made.edited ? NO_ONE_WITH_A_SHEET_EDITED : NO_ONE_WITH_A_SHEET)
  if (!deps.faces) return skip(`Nothing here can find heads: saved as ${as}.`)
  if (!made.file.endsWith('.png')) return skip(`A placeholder picture: saved as ${as}.`)
  const done = await deps.faces.repaint(
    {
      session,
      index,
      file: made.file,
      seed: made.seed,
      ...(made.edited && { edited: true }),
      ...(made.again && { again: true }),
      ...(made.area && { area: made.area }),
      ...(made.change && { change: made.change }),
      sheets,
      expression: faces.expression,
      ...(faces.worn && { worn: faces.worn }),
    },
    emit,
    signal,
  )
  if ('skipped' in done) return skip(done.skipped, done.untouched)
  const { file, pass, missed } = done.faced
  try {
    signal.throwIfAborted()
    // The faces are the picture now, the one before kept beside them with what was made from it.
    const updated = await save((latest) =>
      onto(latest, { ...pass, without: true, other: { file } })
    )
    emit({ type: 'faces', faces: { subjects: pass.subjects, ...(missed.length && { missed }) } })
    return updated
  } catch (err) {
    await removeFiles(deps.store.dir(session.id), [file])
    throw err
  }
}

/**
 * Renders a new picture for Frame `index` with the Session's Image Model and puts it on the Frame
 * as it is now (`save`), in place of its picture by the same model, whose files (and what was made
 * from it: upscale, scene, figures) are then deleted. Its pictures by other models stay, for
 * switching back. Stale if the Frame's Image Prompt changed while it rendered. On failure or Cancel
 * nothing changes, and the new file is removed.
 *
 * In a Session with reference sheets, the render is then given its face pass (`faces`, the Frame's
 * who and how): saved first, so it shows while its faces are repainted, then saved again with
 * them, the render kept beside them (`passFaces`).
 */
export async function replacePicture<S extends Session>(
  deps: RenderDeps,
  session: S,
  index: number,
  prompt: string,
  emit: (event: ProgressEvent) => void,
  signal: AbortSignal,
  save: (change: (s: S) => S) => Promise<S>,
  faces?: FacesOf,
): Promise<{ session: S; frame: S['frames'][number] }> {
  const name = imageName(index)
  const dir = deps.store.dir(session.id)
  const { createdAt } = session.frames[index]
  let rendered: Picture
  let saved: { session: S; frame: S['frames'][number] }
  try {
    rendered = await renderImage(deps, session, prompt, name, emit, signal)
    signal.throwIfAborted()
    let frame!: S['frames'][number]
    let replaced: Picture | undefined
    const updated = await save((latest) => {
      const old = followFrame<S['frames'][number]>(latest.frames, index, createdAt)
      if (!old) throw new GoneError('That Frame no longer exists')
      const picture = old.image?.prompt === prompt ? rendered : { ...rendered, stale: true }
      const next = withPicture(old.pictures, picture)
      replaced = next.replaced
      frame = { ...old, pictures: next.pictures }
      return { ...latest, frames: latest.frames.map((f) => (f === old ? frame : f)) } as S
    })
    if (replaced) await removeFiles(dir, pictureFiles(replaced))
    saved = { session: updated, frame }
  } catch (err) {
    await removeImage(dir, name)
    throw err
  }
  if (!faces) return saved
  let frame!: S['frames'][number]
  const updated = await passFaces(
    deps,
    saved.session,
    index,
    { file: rendered.file, seed: session.seed },
    faces,
    emit,
    signal,
    save,
    (latest, pass) => {
      const changed = changeRenderedPicture(
        latest,
        rendered.file,
        (p) => swapFaces({ ...p, faces: pass }),
      )
      frame = followFrame<S['frames'][number]>(changed.frames, index, createdAt)!
      return changed
    },
  )
  return updated ? { session: updated, frame } : saved
}

/** Deletes whatever image a generator may have written under `name`, e.g. after a Cancel. */
export async function removeImage(dir: string, name: string): Promise<void> {
  for (const ext of ['png', 'svg']) {
    await Deno.remove(join(dir, `${name}.${ext}`)).catch(() => {})
  }
}

export class UpscaleError extends Refusal {}

/**
 * Upscales the picture Frame `index` shows to 2048 px through the shared render queue, then marks
 * that picture, if the Frame still has it, as upscaled. Keeps the original image, which thumbnails
 * and re-renders still use.
 */
export async function upscaleFrame(
  deps: Pick<FrameDeps, 'store' | 'imageGenerator' | 'renderQueue'>,
  session: Session,
  index: number,
  upscaler: Upscaler,
  emit: (event: UpscaleEvent) => void,
  signal: AbortSignal,
  /** Saves the change onto the Session as it is now (`updateSession`): a job runs beside it. */
  save: (change: (s: Session) => Session) => Promise<Session>,
): Promise<Session> {
  const picture = shownVersionOf(session, index)
  if (!picture) throw new UpscaleError(`${frameName(index)} has no image to upscale`)
  if (picture.upscaled) throw new UpscaleError(`${frameName(index)} is already upscaled`)
  const image = picture.file

  const name = `${image.replace(/\.\w+$/, '')}-2048`
  const dir = deps.store.dir(session.id)
  const release = await (deps.renderQueue ?? new RenderQueue()).acquire(
    signal,
    () => emit({ type: 'phase', phase: 'queued' }),
    { job: { kind: 'upscale' } },
  )
  try {
    emit({ type: 'phase', phase: 'image' })
    const { onProgress, onDownload } = imageProgress(emit)
    const upscaled = await deps.imageGenerator.upscale(
      { model: upscaler, image, seed: session.seed, dir, name },
      signal,
      onProgress,
      onDownload,
    )
    signal.throwIfAborted()
    const updated = await save((latest) =>
      changeFramePicture(latest, image, (p) => ({ ...p, upscaled }))
    )
    emit({ type: 'upscaled', session: updated })
    return updated
  } catch (err) {
    await removeImage(dir, name)
    throw err
  } finally {
    release()
  }
}
