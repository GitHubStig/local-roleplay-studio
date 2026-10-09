import { join } from '@std/path'
import type { ImageGenerator } from './images/imageGenerator.ts'
import type { Upscaler } from './images/mflux/models.ts'
import { crossedLimit, limitsEnabled } from './limits.ts'
import { mightNameAPerson, type TextModel } from './textModel.ts'
import type { Previews } from './previews.ts'
import { RenderQueue } from './renderQueue.ts'
import type { FrameTimings, Session, SessionStore } from './session.ts'
import { GoneError } from './update.ts'
import { ContextFullError } from './text/chat.ts'

/** Progress any piece of work reports as it happens, in a Chain or a Storyboard. */
export type ProgressEvent =
  /**
   * `queued`: waiting for another Session's render to finish; `download`: downloading a model the
   * first time it's used, before rendering (or speaking) with it.
   */
  | { type: 'phase'; phase: Phase }
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

/** Progress of an upscale; ends with the Session, every Frame showing that image now upscaled. */
export type UpscaleEvent = ProgressEvent | { type: 'upscaled'; session: Session }

export interface FrameDeps {
  store: SessionStore
  textModel: TextModel
  imageGenerator: ImageGenerator
  /** Shared across Sessions so only one image renders at a time. */
  renderQueue?: RenderQueue
  /** Where a render's previews go, as the picture forms (ComfyUI's). */
  previews?: Previews
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
 * Renders `prompt` into `<dir>/<name>.png` through the shared render queue, recording how long
 * it waited and how long it rendered into `timings`. Returns the image's file name.
 */
export async function renderImage(
  deps: FrameDeps,
  session: Session,
  prompt: string,
  name: string,
  timings: FrameTimings,
  emit: (event: ProgressEvent) => void,
  signal: AbortSignal,
): Promise<string> {
  const queueStart = performance.now()
  let waited = false
  const release = await (deps.renderQueue ?? new RenderQueue()).acquire(signal, () => {
    waited = true
    emit({ type: 'phase', phase: 'queued' })
  }, { job: { kind: 'render', settings: session.settings } })
  if (waited) timings.queued = secondsSince(queueStart)
  const imageStart = performance.now()
  try {
    emit({ type: 'phase', phase: 'image' })
    const dir = deps.store.dir(session.id)
    await Deno.mkdir(dir, { recursive: true })
    const { onProgress, onDownload } = imageProgress(emit)
    const image = await deps.imageGenerator.generate(
      { prompt, seed: session.seed, settings: session.settings, dir, name },
      signal,
      onProgress,
      onDownload,
      deps.previews && ((jpeg) => deps.previews!.set(session.id, jpeg)),
    )
    timings.image = secondsSince(imageStart)
    return image
  } finally {
    deps.previews?.clear(session.id)
    release()
  }
}

/** A Frame with a picture, and what can be made from it, which a new picture makes out of date. */
interface PicturedFrame {
  index: number
  image: string | null
  upscaled?: string
  stale?: boolean
  scene?: { file: string }
  figure?: { file: string }
  lito?: { file: string }
}

/**
 * Renders a new picture for Frame `index` (a Roleplay's or a Storyboard's) and puts it on the Frame
 * as it is now (`save`), replacing the old picture and what was made from it: its upscale, scene
 * and figures, whose files are then deleted. `place` gives the Frame its new picture, from the
 * Frame as saved now without any of those. On failure or Cancel nothing changes, and the new file
 * is removed.
 */
export async function replacePicture<
  S extends Session & { frames: PicturedFrame[] },
  F extends S['frames'][number] = S['frames'][number],
>(
  deps: FrameDeps,
  session: S,
  index: number,
  prompt: string,
  timings: FrameTimings,
  emit: (event: ProgressEvent) => void,
  signal: AbortSignal,
  save: (change: (s: S) => S) => Promise<S>,
  place: (current: F, image: string) => F,
): Promise<{ session: S; frame: F }> {
  const name = imageName(index)
  const dir = deps.store.dir(session.id)
  try {
    const image = await renderImage(deps, session, prompt, name, timings, emit, signal)
    signal.throwIfAborted()
    let frame!: F
    let old!: F
    const updated = await save((latest) => {
      old = latest.frames[index] as F
      if (!old) throw new GoneError('That Frame no longer exists')
      const { stale: _, upscaled: __, scene: ___, figure: ____, lito: _____, ...rest } = old
      frame = place(rest as F, image)
      return { ...latest, frames: latest.frames.map((f) => (f.index === index ? frame : f)) } as S
    })
    for (const file of [old.image, old.upscaled]) {
      if (file && file !== image) await removeImage(dir, file.replace(/\.\w+$/, ''))
    }
    for (const made of [old.scene, old.figure, old.lito]) {
      if (made) await Deno.remove(join(dir, made.file)).catch(() => {})
    }
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
 * Upscales Frame `index`'s image to 2048 px through the shared render queue, then marks every
 * Frame showing that image (a Chain Frame reuses the image before it when nothing changed) as
 * upscaled. Keeps the original image, which thumbnails and re-renders still use.
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
  const frame = session.frames[index]
  if (!frame?.image) throw new UpscaleError(`Frame ${index + 1} has no image to upscale`)
  if (frame.upscaled) throw new UpscaleError(`Frame ${index + 1} is already upscaled`)
  const image = frame.image

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
      ({
        ...latest,
        frames: latest.frames.map((f) => (f.image === image ? { ...f, upscaled } : f)),
      }) as Session
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
