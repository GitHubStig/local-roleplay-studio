import { join } from '@std/path'
import { equal } from '@std/assert'
import { type ImagePrompt, renderPrompt } from '../imagePrompt.ts'
import { crossedLimit } from '../limits.ts'
import type { Scenario } from '../scenario.ts'
import type { ChainFrame, ChainSession, FrameTimings, Outcome, SessionStore } from '../session.ts'
import type { FrameText } from '../textModel.ts'
import { updateSession } from '../update.ts'
import {
  type FrameDeps,
  imageName,
  limitCrossedBy,
  type ProgressEvent,
  removeImage,
  renderImage,
  secondsSince,
  withRetry,
} from '../frames.ts'

/** `fields` without the ones that are undefined, to spread onto an object. */
const definedOnly = <T extends object>(fields: T): Partial<T> =>
  Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as Partial<T>

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

/**
 * Runs one Chain Frame: Text Model, then Image Model (rendering the Image Prompt), then commit. The
 * Frame commits whole or not at all: on failure or abort the Session on disk is untouched and any
 * image written is removed. A declined or unclear Action commits nothing either, and returns null.
 */
export async function runChainFrame(
  deps: FrameDeps,
  session: ChainSession,
  scenario: Scenario,
  action: string | null,
  emit: (event: FrameEvent) => void,
  signal: AbortSignal,
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
  // A declined or unclear Action makes no Frame, as a declined Roleplay Message makes none: the
  // Session stays as it was, and the Action stays with the player to reword.
  if (outcome !== 'done') {
    emit({ type: outcome, message: narration })
    return null
  }
  emit({ type: 'text', outcome, narration, prompt: nextPrompt })
  const timings: FrameTimings = { text: secondsSince(textStart), image: null }

  // Nothing to render if a done Action left the Image Prompt as it was: reuse the previous image.
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
