import { join } from '@std/path'
import { type Backend, imageKindOf } from './backends.ts'
import {
  changeFramePicture,
  type Picture,
  pictureFiles,
  removeFiles,
  shownVersionOf,
  withPicture,
} from './pictures.ts'
import type { ImageGenerator } from './images/imageGenerator.ts'
import type { ImageBackendKind } from './images/imageModels.ts'
import type { Upscaler } from './images/upscalers.ts'
import { crossedLimit, limitsEnabled } from './limits.ts'
import { mightNameAPerson, type TextModel } from './textModel.ts'
import type { Previews } from './previews.ts'
import type { HeavyJob } from './machine.ts'
import { RenderQueue } from './renderQueue.ts'
import type { Session, SessionStore } from './session.ts'
import { renderSettings, type Settings } from './settings.ts'
import { GoneError } from './update.ts'
import { ContextFullError } from './text/chat.ts'

/** Progress any piece of work reports as it happens, in a Chain or a Storyboard. */
export type ProgressEvent =
  /**
   * `queued`: waiting for another Session's render to finish; `download`: downloading a model the
   * first time it's used, before rendering (or speaking) with it.
   */
  /** `imageBackend`: the kind of backend a render runs on, once it starts (`phase: 'image'`). */
  | { type: 'phase'; phase: Phase; imageBackend?: ImageBackendKind }
  /** More of the Text Model's reasoning; `restart` when a retry starts reasoning afresh. */
  | { type: 'thinking'; text: string; restart?: boolean }
  /** Image Model steps completed so far. */
  | { type: 'progress'; step: number; total: number }

export type Phase = 'text' | 'queued' | 'image' | 'audio' | 'download'

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
}

const TEXT_ATTEMPTS = 2

/** Seconds since `start` (a `performance.now()` reading), to one decimal place. */
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

/**
 * Which Limit an Action (or a Brief) crosses, if any (ADR 0002): the term list first, then, for
 * text that looks like it names someone, a narrow real-person question to the Text Model.
 */
export async function limitCrossedBy(
  text: string,
  textModel: TextModel,
  signal: AbortSignal,
): Promise<string | undefined> {
  const listed = crossedLimit(text)?.message
  if (listed) return listed
  if (limitsEnabled() && mightNameAPerson(text) && await textModel.namesRealPerson(text, signal)) {
    return 'no real, identifiable people'
  }
  return undefined
}

/**
 * Renders `prompt` into `<dir>/<name>.png` with the Session's Image Model, through the shared
 * render queue, run as Settings are now (`renderSettings`). Returns the picture, with how long it
 * waited and how long it rendered.
 */
export async function renderImage(
  deps: FrameDeps,
  session: Session,
  prompt: string,
  name: string,
  emit: (event: ProgressEvent) => void,
  signal: AbortSignal,
): Promise<Picture> {
  const settings = deps.settings
    ? renderSettings(session.settings, await deps.settings())
    : session.settings
  // Found once, so the picture records where it was made.
  const job: HeavyJob = { kind: 'render', model: settings.imageModel }
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
      { prompt, seed: session.seed, settings, dir, name, ...(backend && { backend }) },
      signal,
      onProgress,
      onDownload,
      deps.previews && ((jpeg) => deps.previews!.set(session.id, jpeg)),
    )
    return {
      image,
      imageModel: settings.imageModel,
      ...(kind && { imageBackend: kind }),
      timings: { ...(queued !== undefined && { queued }), image: secondsSince(imageStart) },
    }
  } finally {
    deps.previews?.clear(session.id)
    release()
  }
}

/**
 * Renders a new picture for Frame `index` with the Session's Image Model and puts it on the Frame
 * as it is now (`save`), in place of its picture by the same model, whose files (and what was made
 * from it: upscale, scene, figures) are then deleted. Its pictures by other models stay, for
 * switching back. Stale if the Frame's Image Prompt changed while it rendered. On failure or Cancel
 * nothing changes, and the new file is removed.
 */
export async function replacePicture<S extends Session>(
  deps: FrameDeps,
  session: S,
  index: number,
  prompt: string,
  emit: (event: ProgressEvent) => void,
  signal: AbortSignal,
  save: (change: (s: S) => S) => Promise<S>,
): Promise<{ session: S; frame: S['frames'][number] }> {
  const name = imageName(index)
  const dir = deps.store.dir(session.id)
  const { createdAt } = session.frames[index]
  try {
    const rendered = await renderImage(deps, session, prompt, name, emit, signal)
    signal.throwIfAborted()
    let frame!: S['frames'][number]
    let replaced: Picture | undefined
    const updated = await save((latest) => {
      const old = followFrame<S['frames'][number]>(latest.frames, index, createdAt)
      if (!old) throw new GoneError('That Frame no longer exists')
      const picture = old.prompt === prompt ? rendered : { ...rendered, stale: true }
      const next = withPicture(old.pictures, picture)
      replaced = next.replaced
      frame = { ...old, pictures: next.pictures }
      return { ...latest, frames: latest.frames.map((f) => (f === old ? frame : f)) } as S
    })
    if (replaced) await removeFiles(dir, pictureFiles(replaced))
    return { session: updated, frame }
  } catch (err) {
    await removeImage(dir, name)
    throw err
  }
}

/** Deletes whatever image a generator may have written under `name`, e.g. after a Cancel. */
export async function removeImage(dir: string, name: string): Promise<void> {
  for (const ext of ['png', 'svg']) {
    await Deno.remove(join(dir, `${name}.${ext}`)).catch(() => {})
  }
}

export class UpscaleError extends Error {}

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
  if (!picture) throw new UpscaleError(`Frame ${index + 1} has no image to upscale`)
  if (picture.upscaled) throw new UpscaleError(`Frame ${index + 1} is already upscaled`)
  const { image } = picture

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
