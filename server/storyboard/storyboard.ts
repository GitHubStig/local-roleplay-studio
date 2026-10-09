import { equal } from '@std/assert'
import {
  type FrameDeps,
  limitCrossedBy,
  type ProgressEvent,
  replacePicture,
  secondsSince,
  withRetry,
} from '../frames.ts'
import { updateSession } from '../update.ts'
import {
  cleanLook,
  composePrompt,
  lookLimit,
  matchShown,
  renameShown,
  shownPeople,
} from '../look.ts'
import { crossedLimit } from '../limits.ts'
import type { Scenario } from '../scenario.ts'
import type { FrameTimings, Look, Outcome, StoryboardFrame, StoryboardSession } from '../session.ts'
import { plainSentences } from '../textModel.ts'

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

/**
 * Builds a Frame from its Beat and sentences, marking it blocked (unrenderable until edited) if its
 * prompt crosses a Limit.
 */
function makeFrame(
  look: Look,
  index: number,
  beat: string,
  body: string,
  shown: string[],
  timings?: FrameTimings,
): StoryboardFrame {
  const names = matchShown(look.people, shown)
  const prompt = composePrompt(look, body, names)
  const blocked = crossedLimit(prompt)?.message
  return {
    index,
    beat,
    body,
    shown: names,
    prompt,
    image: null,
    ...(timings ? { timings } : {}),
    ...(blocked ? { blocked } : {}),
    createdAt: new Date().toISOString(),
  }
}

/**
 * A Frame after its Look, sentences or who it shows changed: same image, marked stale if it had
 * one.
 */
function recompose(
  frame: StoryboardFrame,
  look: Look,
  body = frame.body,
  shown = frame.shown,
): StoryboardFrame {
  const fresh = makeFrame(look, frame.index, frame.beat, body, shown, frame.timings)
  const changed = fresh.prompt !== frame.prompt
  // The picture, and what was made from it, stay until it's rendered again.
  const { image, upscaled, scene, figure, lito, createdAt } = frame
  return {
    ...fresh,
    image,
    ...(upscaled && { upscaled }),
    ...(scene && { scene }),
    ...(figure && { figure }),
    ...(lito && { lito }),
    createdAt,
    ...(image && (changed || frame.stale) ? { stale: true } : {}),
  }
}

function checkLook(look: Look): void {
  const limit = lookLimit(look)
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
          frame: (index, { body, shown }) => {
            writtenIn[index] = secondsSince(mark)
            mark = performance.now()
            if (look) {
              emit({
                type: 'planned-frame',
                frame: makeFrame(look, index, beats[index] ?? '', body, shown),
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
    frames: plan.frames.map(({ body, shown }, i) =>
      makeFrame(plan.look, i, plan.beats[i], body, shown, { text: writtenIn[i] ?? 0, image: null })
    ),
  }
  await deps.store.save(planned)
  emit({ type: 'planned', session: planned })
  return planned
}

/**
 * Renders (or re-renders) one Frame, replacing its image and what was made from it (upscale,
 * scene, figures). Nothing changes unless the render completes. Saved onto the Storyboard as it is
 * now, as a queued job runs beside edits: a Frame edited meanwhile keeps its new sentences and is
 * marked stale.
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
  const { frame: rendered } = await replacePicture(
    deps,
    session,
    index,
    frame.prompt,
    timings,
    emit,
    signal,
    (change) => updateSession(deps.store, session.id, 'storyboard', change),
    (current, image) => ({
      ...current,
      image,
      timings,
      ...(current.prompt !== frame.prompt && { stale: true }),
    }),
  )
  emit({ type: 'rendered', frame: rendered })
  return rendered
}

/**
 * Replaces one Frame's own sentences, typed by hand, and who it shows if given. Refused if the
 * result crosses a Limit.
 */
export async function setFrameBody(
  deps: Pick<FrameDeps, 'store'>,
  session: StoryboardSession,
  index: number,
  body: string,
  shown?: string[],
): Promise<StoryboardSession> {
  const frame = session.frames[index]
  if (!frame || !session.look) throw new Error(`There is no Frame ${index + 1}`)
  const text = plainSentences(body)
  if (!text) throw new Error('A Frame needs some text')
  // Onto the Storyboard as it is now: a queued render may have finished meanwhile.
  return await updateSession(deps.store, session.id, 'storyboard', (latest) => {
    const frame = latest.frames[index]
    const edited = recompose(frame, latest.look!, text, shown ?? frame.shown)
    if (edited.blocked) throw new LimitError(`That crosses a limit: ${edited.blocked}`)
    return { ...latest, frames: latest.frames.map((f) => f.index === index ? edited : f) }
  })
}

/**
 * Replaces the Look, typed by hand, and rewrites every Frame's prompt with it. A person renamed
 * in place stays shown where they were.
 */
export async function setLook(
  deps: Pick<FrameDeps, 'store'>,
  session: StoryboardSession,
  look: Look,
): Promise<StoryboardSession> {
  const clean = cleanLook(look)
  checkLook(clean)
  return await updateSession(deps.store, session.id, 'storyboard', (latest) => ({
    ...latest,
    look: clean,
    frames: latest.frames.map((f) =>
      recompose(f, clean, f.body, renameShown(latest.look!.people, clean.people, f.shown))
    ),
  }))
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
          shown: shownPeople(session.look!, frame.shown).map((p) => p.name),
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
  const withEdit = (frames: StoryboardFrame[]) =>
    frames.map((f) => {
      const next = f.index === index
        ? recompose(f, look, edit.body, edit.shown)
        : recompose(f, look, f.body, renameShown(session.look!.people, look.people, f.shown))
      return f.index === index
        ? { ...next, timings: { text: secondsSince(start), image: f.timings?.image ?? null } }
        : next
    })
  const edited = withEdit(session.frames)[index]
  if (edited.blocked) return unchanged('declined', `Declined: ${edited.blocked}.`)
  signal.throwIfAborted()
  // Onto the Storyboard as it is now: a queued render may have finished meanwhile.
  const updated = await updateSession(deps.store, session.id, 'storyboard', (latest) => ({
    ...latest,
    look,
    frames: withEdit(latest.frames),
  }))
  return { outcome: 'done', narration: edit.narration, session: updated }
}
