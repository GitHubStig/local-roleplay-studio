import { equal } from '@std/assert'
import { type ImagePrompt, peopleAway } from '../imagePrompt.ts'
import { crossedLimit, LimitError } from '../limits.ts'
import type { Scenario } from '../scenario.ts'
import type { ChainFrame, ChainSession, FrameTimings, Outcome, SessionStore } from '../session.ts'
import type { FrameText } from '../textModel.ts'
import { GoneError, updateSession } from '../update.ts'
import { allPictureFiles, allStale, removeFiles } from '../pictures.ts'
import { renumberCallLogs } from '../calls.ts'
import {
  type FrameDeps,
  imageName,
  limitCrossedBy,
  type ProgressEvent,
  removeImage,
  renderImage,
  replacePicture,
  secondsSince,
  withRetry,
} from '../frames.ts'

/** Why a done Action that left the Image Prompt as it was makes no Frame. */
export const UNCHANGED = 'Nothing in the picture changed. Try rewording the Action.'

/** Progress of a Chain Frame, streamed to the player as it happens. */
export type FrameEvent =
  | ProgressEvent
  /** The new Image Prompt before its image exists; provisional until `committed`. */
  | { type: 'text'; outcome: Outcome; narration: string; prompt: ImagePrompt }
  | { type: 'committed'; frame: ChainFrame }
  /** The Action crossed a Limit, or the Text Model declined it: nothing was saved. */
  | { type: 'declined'; message: string }
  /** The Text Model couldn't tell what to change, and asks: nothing was saved. */
  | { type: 'unclear'; message: string }
  /** The Text Model took the Action but left the Image Prompt as it was: nothing was saved. */
  | { type: 'unchanged'; message: string }

/**
 * Runs one Chain Frame: Text Model, then Image Model (rendering the Image Prompt), then commit. The
 * Frame commits whole or not at all: on failure or abort the Session on disk is untouched and any
 * image written is removed. A declined or unclear Action commits nothing either, nor one that left
 * the Image Prompt as it was, and returns null.
 */
export async function runChainFrame(
  deps: FrameDeps,
  session: ChainSession,
  scenario: Scenario,
  action: string | null,
  emit: (event: FrameEvent) => void,
  signal: AbortSignal,
  /** Render the new picture; off, the Frame gets only its prompt, to render later. */
  render = true,
): Promise<ChainFrame | null> {
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
          {
            scenario,
            prompt: previous?.prompt ?? null,
            action,
            away: previous ? peopleAway(session.frames.map((f) => f.prompt), previous.prompt) : [],
          },
          signal,
          onThinking,
        ),
      signal,
      emit,
    )
    thinking = text.thinking
    const promptLimit = crossedLimit(text.prompt)
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
  // A declined or unclear Action makes no Frame, as a declined Roleplay Message makes none: the
  // Session stays as it was, and the Action stays with the player to reword.
  if (outcome !== 'done') {
    emit({ type: outcome, message: narration })
    return null
  }
  // Nor does a done Action that left the Image Prompt as it was (often a Narration claiming a
  // change the prompt doesn't have): there'd be nothing new to see.
  if (previous && equal(nextPrompt, previous.prompt)) {
    emit({ type: 'unchanged', message: UNCHANGED })
    return null
  }
  emit({ type: 'text', outcome, narration, prompt: nextPrompt })
  const timings: FrameTimings = { text: secondsSince(textStart) }

  const dir = deps.store.dir(session.id)
  // Named up front so a failed or cancelled Frame can remove whatever the generator wrote, even if
  // it finished writing just as the Frame was cancelled.
  const name = imageName(index)
  try {
    const picture = render
      ? await renderImage(deps, session, nextPrompt, name, emit, signal)
      : undefined
    signal.throwIfAborted()

    const frame: ChainFrame = {
      index,
      action,
      prompt: nextPrompt,
      narration,
      outcome,
      ...(thinking ? { thinking } : {}),
      pictures: picture ? [picture] : [],
      timings,
      createdAt: new Date().toISOString(),
    }
    // Onto the Chain as it is now: a job may have upscaled or made 3D of a picture meanwhile.
    await updateSession(deps.store, session.id, 'chain', (latest) => ({
      ...latest,
      frames: [...latest.frames, frame],
    }))
    session.frames.push(frame)
    emit({ type: 'committed', frame })
    return frame
  } catch (err) {
    await removeImage(dir, name)
    throw err
  }
}

/**
 * Renders a Chain Frame by the Chain's Image Model, in its turn in the render queue: one made
 * without a picture, or again, replacing its picture by that model (after a prompt edit, or with
 * Settings' size, Fast and the rest changed since).
 */
export async function renderChainFrame(
  deps: FrameDeps,
  session: ChainSession,
  index: number,
  emit: (event: ProgressEvent) => void,
  signal: AbortSignal,
): Promise<ChainSession> {
  const frame = session.frames[index]
  const { session: updated } = await replacePicture(
    deps,
    session,
    index,
    frame.prompt,
    emit,
    signal,
    (change) => updateSession(deps.store, session.id, 'chain', change),
  )
  return updated
}

export class UndoError extends Error {}

/**
 * Removes a Chain's latest Frame, so the previous Frame's Image Prompt is current again. `index` must name the
 * latest Frame, so a repeated request can't undo two. The Opening Frame can't be undone. Its
 * pictures, and what was made from them, are deleted.
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
  await removeFiles(store.dir(session.id), allPictureFiles(latest))
  return updated
}

export class DeleteError extends Error {}

/**
 * Deletes a Chain's Frame `index`, any but the Opening Frame, and numbers the Frames after it down
 * one; the call log follows. `seen` is the Chain as the player saw it: how many Frames it had and
 * when this one was made, so a repeated request can't delete the Frame that took its place (two
 * Frames can share a millisecond). Its pictures, and what was made from them, are deleted. The
 * Frames after it keep their Image Prompts as written, made from the deleted one's.
 */
export async function deleteFrame(
  store: SessionStore,
  session: ChainSession,
  index: number,
  seen: { frames: number; createdAt: string },
): Promise<ChainSession> {
  let deleted!: ChainFrame
  const updated = await updateSession(store, session.id, 'chain', (now) => {
    deleted = now.frames[index]
    if (!deleted || deleted.createdAt !== seen.createdAt || now.frames.length !== seen.frames) {
      throw new GoneError('That Frame is no longer there')
    }
    if (index === 0) throw new DeleteError("The Opening Frame can't be deleted")
    return {
      ...now,
      frames: now.frames
        .filter((f) => f.index !== index)
        .map((f, i) => (f.index === i ? f : { ...f, index: i })),
    }
  })
  await removeFiles(store.dir(session.id), allPictureFiles(deleted))
  await renumberCallLogs(store.dir(session.id), index)
  return updated
}

/**
 * Replaces a Chain Frame's Image Prompt, typed by hand: its pictures (by every Image Model) are
 * marked out of date until rendered again, and the Frames after it keep theirs. The latest
 * Frame's is what the next Action changes. Refused if it crosses a Limit.
 */
export async function setFramePrompt(
  store: SessionStore,
  session: ChainSession,
  index: number,
  prompt: string,
): Promise<ChainSession> {
  const text = prompt.replace(/\s+/g, ' ').trim()
  if (!text) throw new EditError('An Image Prompt needs some text')
  const limit = crossedLimit(text)
  if (limit) throw new LimitError(`That crosses a limit: ${limit.message}`)
  // Onto the Chain as it is now: a queued render may have finished meanwhile.
  return await updateSession(store, session.id, 'chain', (now) => {
    const frame = now.frames[index]
    if (!frame) throw new GoneError('That Frame is no longer there')
    if (frame.prompt === text) return now
    const edited = { ...frame, prompt: text, pictures: allStale(frame.pictures) }
    return { ...now, frames: now.frames.map((f) => (f.index === index ? edited : f)) }
  })
}

export class EditError extends Error {}
