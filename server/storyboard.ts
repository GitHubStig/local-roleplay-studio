import { equal } from '@std/assert'
import {
  type FrameDeps,
  imageName,
  limitCrossedBy,
  type ProgressEvent,
  removeImage,
  renderImage,
  secondsSince,
  withRetry,
} from './frames.ts'
import { renderPrompt } from './imagePrompt.ts'
import { crossedLimit } from './limits.ts'
import type { Scenario } from './scenario.ts'
import type { FrameTimings, Look, Outcome, StoryboardFrame, StoryboardSession } from './session.ts'
import { plainSentences } from './textModel.ts'

/** Progress of Storyboard work, streamed to the player as it happens. */
export type StoryboardEvent =
  | ProgressEvent
  /** Parts of the plan, as the Text Model writes them; provisional until `planned`. */
  | { type: 'look'; look: Look }
  | { type: 'beats'; beats: string[] }
  | { type: 'planned-frame'; frame: StoryboardFrame }
  | { type: 'planned'; session: StoryboardSession }
  | { type: 'rendered'; frame: StoryboardFrame }

/** A Brief, Action or edit that crosses a Limit (ADR 0002). */
export class LimitError extends Error {}

/** A Storyboard Frame's Image Prompt: the Look's subject, the Frame's own sentences, the style. */
export const composePrompt = (look: Look, body: string) =>
  [look.subject, body, look.style].map(asSentences).filter(Boolean).join(' ')

/** Trimmed text that ends a sentence, so parts written apart don't run together. */
const asSentences = (text: string) => {
  const t = text.trim()
  return !t || /[.!?]["')\]]?$/.test(t) ? t : `${t}.`
}

/**
 * Builds a Frame from its Beat and sentences, marking it blocked (unrenderable until edited) if its
 * prompt crosses a Limit.
 */
function makeFrame(
  look: Look,
  index: number,
  beat: string,
  body: string,
  timings?: FrameTimings,
): StoryboardFrame {
  const prompt = composePrompt(look, body)
  const promptText = renderPrompt(prompt)
  const blocked = crossedLimit(promptText)?.message
  return {
    index,
    beat,
    body,
    prompt,
    promptText,
    image: null,
    ...(timings ? { timings } : {}),
    ...(blocked ? { blocked } : {}),
    createdAt: new Date().toISOString(),
  }
}

/** A Frame after its Look or sentences changed: same image, marked stale if it had one. */
function recompose(frame: StoryboardFrame, look: Look, body = frame.body): StoryboardFrame {
  const fresh = makeFrame(look, frame.index, frame.beat, body, frame.timings)
  const changed = fresh.promptText !== frame.promptText
  return {
    ...fresh,
    image: frame.image,
    createdAt: frame.createdAt,
    ...(frame.image && (changed || frame.stale) ? { stale: true } : {}),
  }
}

function checkLook(look: Look): void {
  const limit = crossedLimit(renderPrompt(`${look.subject} ${look.style}`))?.message
  if (limit) throw new LimitError(`The Look crosses a limit: ${limit}`)
}

/**
 * Plans an empty Storyboard in one Text Model call: the Look, then the Beats, then each Frame,
 * reported as they arrive. Commits all or nothing: on failure or Cancel nothing is saved.
 */
export async function planStoryboard(
  deps: FrameDeps,
  session: StoryboardSession,
  scenario: Scenario,
  emit: (event: StoryboardEvent) => void,
  signal: AbortSignal,
): Promise<StoryboardSession> {
  if (session.frames.length > 0) throw new Error('This Storyboard is already planned')
  emit({ type: 'phase', phase: 'text' })
  const briefLimit = await limitCrossedBy(scenario.openingPrompt, deps.textModel, signal)
  if (briefLimit) throw new LimitError(`The Brief crosses a limit: ${briefLimit}`)

  // When each Frame's sentences arrived: its "text" time is the wait since the one before.
  let mark = performance.now()
  const writtenIn: number[] = []
  let beats: string[] = []
  let look: Look | null = null
  const plan = await withRetry(
    (onThinking) => {
      mark = performance.now()
      return deps.textModel.planStoryboard(
        { scenario, frameCount: session.frameCount },
        signal,
        {
          thinking: onThinking,
          look: (l) => {
            look = l
            emit({ type: 'look', look: l })
          },
          beats: (b) => {
            beats = b
            emit({ type: 'beats', beats: b })
          },
          frame: (index, body) => {
            writtenIn[index] = secondsSince(mark)
            mark = performance.now()
            if (look) {
              emit({
                type: 'planned-frame',
                frame: makeFrame(look, index, beats[index] ?? '', body),
              })
            }
          },
        },
      )
    },
    signal,
    emit,
  )
  checkLook(plan.look)
  signal.throwIfAborted()

  const planned: StoryboardSession = {
    ...session,
    look: plan.look,
    frames: plan.bodies.map((body, i) =>
      makeFrame(plan.look, i, plan.beats[i], body, { text: writtenIn[i] ?? 0, image: null })
    ),
  }
  await deps.store.save(planned)
  emit({ type: 'planned', session: planned })
  return planned
}

/**
 * Renders (or re-renders) one Frame, replacing its image. Nothing changes unless the render
 * completes; the old image is deleted only once the new one is saved.
 */
export async function renderStoryboardFrame(
  deps: FrameDeps,
  session: StoryboardSession,
  index: number,
  emit: (event: StoryboardEvent) => void,
  signal: AbortSignal,
): Promise<StoryboardFrame> {
  const frame = session.frames[index]
  if (!frame) throw new Error(`There is no Frame ${index + 1}`)
  if (frame.blocked) throw new LimitError(`Frame ${index + 1} crosses a limit: ${frame.blocked}`)

  const timings: FrameTimings = { text: frame.timings?.text ?? 0, image: null }
  const name = imageName(index)
  const dir = deps.store.dir(session.id)
  try {
    const image = await renderImage(deps, session, frame.promptText, name, timings, emit, signal)
    signal.throwIfAborted()
    // A new image replaces the old one and its upscale.
    const { stale: _, upscaled: __, ...rest } = frame
    const rendered: StoryboardFrame = { ...rest, image, timings }
    const frames = session.frames.map((f) => f.index === index ? rendered : f)
    await deps.store.save({ ...session, frames })
    session.frames = frames
    if (frame.image && frame.image !== image) {
      await removeImage(dir, frame.image.replace(/\.\w+$/, ''))
    }
    if (frame.upscaled) await removeImage(dir, frame.upscaled.replace(/\.\w+$/, ''))
    emit({ type: 'rendered', frame: rendered })
    return rendered
  } catch (err) {
    await removeImage(dir, name)
    throw err
  }
}

/** Replaces one Frame's own sentences, typed by hand. Refused if the result crosses a Limit. */
export async function setFrameBody(
  deps: Pick<FrameDeps, 'store'>,
  session: StoryboardSession,
  index: number,
  body: string,
): Promise<StoryboardSession> {
  const frame = session.frames[index]
  if (!frame || !session.look) throw new Error(`There is no Frame ${index + 1}`)
  const text = plainSentences(body)
  if (!text) throw new Error('A Frame needs some text')
  const edited = recompose(frame, session.look, text)
  if (edited.blocked) throw new LimitError(`That crosses a limit: ${edited.blocked}`)
  const updated = { ...session, frames: session.frames.map((f) => f.index === index ? edited : f) }
  await deps.store.save(updated)
  return updated
}

/** Replaces the Look, typed by hand, and rewrites every Frame's prompt with it. */
export async function setLook(
  deps: Pick<FrameDeps, 'store'>,
  session: StoryboardSession,
  look: Look,
): Promise<StoryboardSession> {
  const clean = { subject: plainSentences(look.subject), style: plainSentences(look.style) }
  if (!clean.subject || !clean.style) throw new Error('The Look needs both a subject and a style')
  checkLook(clean)
  const updated = {
    ...session,
    look: clean,
    frames: session.frames.map((f) => recompose(f, clean)),
  }
  await deps.store.save(updated)
  return updated
}

export interface StoryboardEditResult {
  outcome: Outcome
  narration: string
  session: StoryboardSession
}

/**
 * Edits one Frame through the Text Model, following an Action; may change the Look too, which
 * rewrites every Frame. Declined or unclear Actions change nothing.
 */
export async function editFrameByAction(
  deps: FrameDeps,
  session: StoryboardSession,
  scenario: Scenario,
  index: number,
  action: string,
  emit: (event: StoryboardEvent) => void,
  signal: AbortSignal,
): Promise<StoryboardEditResult> {
  const frame = session.frames[index]
  if (!frame || !session.look) throw new Error(`There is no Frame ${index + 1}`)
  emit({ type: 'phase', phase: 'text' })
  const start = performance.now()
  const unchanged = (outcome: Outcome, narration: string) => ({ outcome, narration, session })

  const actionLimit = await limitCrossedBy(action, deps.textModel, signal)
  if (actionLimit) return unchanged('declined', `Declined: ${actionLimit}.`)

  const edit = await withRetry(
    (onThinking) =>
      deps.textModel.editStoryboardFrame(
        {
          scenario,
          look: session.look!,
          beats: session.frames.map((f) => f.beat),
          index,
          body: frame.body,
          action,
        },
        signal,
        onThinking,
      ),
    signal,
    emit,
  )
  if (edit.outcome !== 'done') return unchanged(edit.outcome, edit.narration)

  const lookChanged = !equal(edit.look, session.look)
  const look = lookChanged ? edit.look : session.look
  try {
    if (lookChanged) checkLook(look)
  } catch (err) {
    return unchanged('declined', `Declined: ${(err as Error).message}.`)
  }
  const frames = session.frames.map((f) => {
    const next = recompose(f, look, f.index === index ? edit.body : f.body)
    return f.index === index
      ? { ...next, timings: { text: secondsSince(start), image: f.timings?.image ?? null } }
      : next
  })
  const edited = frames[index]
  if (edited.blocked) return unchanged('declined', `Declined: ${edited.blocked}.`)
  signal.throwIfAborted()
  const updated = { ...session, look, frames }
  await deps.store.save(updated)
  return { outcome: 'done', narration: edit.narration, session: updated }
}
