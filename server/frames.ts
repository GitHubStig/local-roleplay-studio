import { equal } from '@std/assert'
import { join } from '@std/path'
import type { ImageGenerator } from './imageGenerator.ts'
import type { Upscaler } from './imageModels.ts'
import { type ImagePrompt, renderPrompt } from './imagePrompt.ts'
import { crossedLimit, limitsEnabled } from './limits.ts'
import { mightNameAPerson } from './textModel.ts'
import { RenderQueue } from './renderQueue.ts'
import { updateSession } from './update.ts'
import type { Scenario } from './scenario.ts'
import {
  type ChainFrame,
  type ChainSession,
  type FrameTimings,
  type Outcome,
  type Session,
  type SessionStore,
} from './session.ts'
import type { FrameText, TextModel } from './textModel.ts'

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

/** Progress of a Chain Frame, streamed to the player as it happens. */
export type FrameEvent =
  | ProgressEvent
  /** The new Image Prompt before its image exists; provisional until `committed`. */
  | { type: 'text'; outcome: Outcome; narration: string; prompt: ImagePrompt }
  | { type: 'committed'; frame: ChainFrame }

/** Progress of an upscale; ends with the Session, every Frame showing that image now upscaled. */
export type UpscaleEvent = ProgressEvent | { type: 'upscaled'; session: Session }

export interface FrameDeps {
  store: SessionStore
  textModel: TextModel
  imageGenerator: ImageGenerator
  /** Shared across Sessions so only one image renders at a time. */
  renderQueue?: RenderQueue
}

const TEXT_ATTEMPTS = 2

/**
 * Saves a change onto `session` as given: right for a Chain, which holds its lock while it works.
 * A Roleplay saves through its `updateSession` instead, since its conversation moves on meanwhile.
 */
export const saveAsGiven =
  <S extends { id: string }>(store: SessionStore, session: S) =>
  async (change: (s: S) => S): Promise<S> => {
    const updated = change(session)
    await store.save(updated as unknown as Session)
    return updated
  }

/** `fields` without the ones that are undefined, to spread onto an object. */
const definedOnly = <T extends object>(fields: T): Partial<T> =>
  Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as Partial<T>

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
      if (signal.aborted) throw err
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
 * Renders `promptText` into `<dir>/<name>.png` through the shared render queue, recording how long
 * it waited and how long it rendered into `timings`. Returns the image's file name.
 */
export async function renderImage(
  deps: FrameDeps,
  session: Session,
  promptText: string,
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
  })
  if (waited) timings.queued = secondsSince(queueStart)
  const imageStart = performance.now()
  try {
    emit({ type: 'phase', phase: 'image' })
    const dir = deps.store.dir(session.id)
    await Deno.mkdir(dir, { recursive: true })
    const { onProgress, onDownload } = imageProgress(emit)
    const image = await deps.imageGenerator.generate(
      { prompt: promptText, seed: session.seed, settings: session.settings, dir, name },
      signal,
      onProgress,
      onDownload,
    )
    timings.image = secondsSince(imageStart)
    return image
  } finally {
    release()
  }
}

/** Deletes whatever image a generator may have written under `name`, e.g. after a Cancel. */
export async function removeImage(dir: string, name: string): Promise<void> {
  for (const ext of ['png', 'svg']) {
    await Deno.remove(join(dir, `${name}.${ext}`)).catch(() => {})
  }
}

/**
 * Runs one Chain Frame: Text Model, then Image Model (rendering the Image Prompt), then commit. The
 * Frame commits whole or not at all: on failure or abort the Session on disk is untouched and any
 * image written is removed.
 */
export async function runChainFrame(
  deps: FrameDeps,
  session: ChainSession,
  scenario: Scenario,
  action: string | null,
  emit: (event: FrameEvent) => void,
  signal: AbortSignal,
): Promise<ChainFrame> {
  const previous = session.frames.at(-1)
  const index = session.frames.length

  emit({ type: 'phase', phase: 'text' })
  const textStart = performance.now()
  let outcome: Outcome
  let narration: string
  let nextPrompt: ImagePrompt
  let thinking: string | undefined

  // The engine, not the Text Model, enforces the limits (ADR 0002). An Action that plainly
  // crosses one is declined without asking the Text Model to write anything.
  const actionLimit = previous && action
    ? await limitCrossedBy(action, deps.textModel, signal)
    : undefined
  if (previous && actionLimit) {
    outcome = 'declined'
    narration = `Declined: ${actionLimit}.`
    nextPrompt = previous.prompt
  } else {
    const text: FrameText = await withRetry(
      (onThinking) =>
        deps.textModel.write(
          { scenario, prompt: previous?.prompt ?? null, action },
          signal,
          onThinking,
        ),
      signal,
      emit,
    )
    thinking = text.thinking
    const promptLimit = crossedLimit(renderPrompt(text.prompt))
    if (!previous) {
      // The Opening Frame always counts as done, so it can't be declined: it fails instead.
      if (promptLimit) throw new Error(`The opening prompt crossed a limit: ${promptLimit.message}`)
      outcome = 'done'
      narration = text.narration
      nextPrompt = text.prompt
    } else if (text.outcome !== 'done') {
      outcome = text.outcome
      narration = text.narration
      nextPrompt = previous.prompt
    } else if (promptLimit) {
      outcome = 'declined'
      narration = `Declined: ${promptLimit.message}.`
      nextPrompt = previous.prompt
    } else {
      outcome = 'done'
      narration = text.narration
      nextPrompt = text.prompt
    }
  }
  emit({ type: 'text', outcome, narration, prompt: nextPrompt })
  const timings: FrameTimings = { text: secondsSince(textStart), image: null }

  // Nothing to render if the Image Prompt didn't change: declined, unclear, or a done Action the
  // Text Model left without effect. Reuse the previous image.
  const reuseImage = previous !== undefined && equal(nextPrompt, previous.prompt)

  const dir = deps.store.dir(session.id)
  let image: string
  let promptText: string
  // Named up front so a failed or cancelled Frame can remove whatever the generator wrote, even if
  // it finished writing just as the Frame was cancelled.
  const name = imageName(index)
  try {
    if (reuseImage) {
      image = previous!.image
      promptText = previous!.promptText
    } else {
      promptText = renderPrompt(nextPrompt)
      image = await renderImage(deps, session, promptText, name, timings, emit, signal)
    }
    signal.throwIfAborted()

    let frame: ChainFrame = {
      index,
      action,
      prompt: nextPrompt,
      narration,
      outcome,
      ...(thinking ? { thinking } : {}),
      promptText,
      image,
      timings,
      createdAt: new Date().toISOString(),
    }
    // Onto the Chain as it is now: a job may have upscaled or made 3D of a picture meanwhile.
    await updateSession(deps.store, session.id, 'chain', (latest) => {
      // A reused picture brings what was made from it (upscale, scene, figures).
      const before = latest.frames.at(-1)
      if (reuseImage && before) {
        const { upscaled, scene, figure, lito } = before
        frame = { ...frame, ...definedOnly({ upscaled, scene, figure, lito }) }
      }
      return { ...latest, frames: [...latest.frames, frame] }
    })
    session.frames.push(frame)
    emit({ type: 'committed', frame })
    return frame
  } catch (err) {
    await removeImage(dir, name)
    throw err
  }
}

export class UndoError extends Error {}

/**
 * Removes a Chain's latest Frame, so the previous Frame's Image Prompt is current again. `index` must name the
 * latest Frame, so a repeated request can't undo two. The Opening Frame can't be undone. The
 * image file is deleted only when no remaining Frame still shows it.
 */
export async function undoLatestFrame(
  store: SessionStore,
  session: ChainSession,
  index: number,
): Promise<ChainSession> {
  let latest!: ChainFrame
  // As it is now: a job may have made something from the latest picture meanwhile.
  const updated = await updateSession(store, session.id, 'chain', (now) => {
    latest = now.frames.at(-1)!
    if (!latest || latest.index !== index) {
      throw new UndoError(`Frame ${index} is not the latest Frame`)
    }
    if (now.frames.length === 1) throw new UndoError("The Opening Frame can't be undone")
    return { ...now, frames: now.frames.slice(0, -1) }
  })
  if (!updated.frames.some((t) => t.image === latest.image)) {
    await Deno.remove(join(store.dir(session.id), latest.image)).catch(() => {})
    const made = [latest.upscaled, latest.scene?.file, latest.figure?.file, latest.lito?.file]
    for (const file of made) {
      if (file) await Deno.remove(join(store.dir(session.id), file)).catch(() => {})
    }
  }
  return updated
}

export class UpscaleError extends Error {}

/**
 * Upscales Frame `index`'s image to 2048 px through the shared render queue, then marks every
 * Frame showing that image (a Chain Frame reuses the image before it when nothing changed) as
 * upscaled. Keeps the original image, which thumbnails and re-renders still use.
 */
export async function upscaleFrame(
  deps: FrameDeps,
  session: Session,
  index: number,
  upscaler: Upscaler,
  emit: (event: UpscaleEvent) => void,
  signal: AbortSignal,
  save: (change: (s: Session) => Session) => Promise<Session> = saveAsGiven(deps.store, session),
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
