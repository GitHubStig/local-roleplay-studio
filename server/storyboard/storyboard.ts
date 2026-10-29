import {
  type FrameDeps,
  frameName,
  limitCrossedBy,
  type ProgressEvent,
  replacePicture,
  secondsSince,
  withRetry,
} from '../frames.ts'
import { logCallsUnder, makeRoomInCallLogs, renumberCallLogs, reorderCallLogs } from '../calls.ts'
import { GoneError, updateSession } from '../update.ts'
import { allPictureFiles, allStale, removeFiles } from '../pictures.ts'
import {
  cleanLook,
  composePrompt,
  lookLimit,
  matchShown,
  renameShown,
  shownSubjects,
} from '../look.ts'
import { crossedLimit, LimitError } from '../limits.ts'
import type { Scenario } from '../scenario.ts'
import type { FrameTimings, Look, Outcome, StoryboardFrame, StoryboardSession } from '../session.ts'
import { plainSentences, type PlannedBeat } from '../textModel.ts'

/** Progress of Storyboard work, streamed to the player as it happens. */
export type StoryboardEvent =
  | ProgressEvent
  /** Parts of the plan, as the Text Model writes them; provisional until `planned`. */
  | { type: 'look'; look: Look }
  | { type: 'planned-beat'; index: number; beat: string; shown: string[] }
  | { type: 'planned'; session: StoryboardSession }
  /** A Frame written from the plan, saved as it comes; `written` once the last one is. */
  | { type: 'written-frame'; frame: StoryboardFrame }
  | { type: 'written'; session: StoryboardSession }
  | { type: 'rendered'; frame: StoryboardFrame }

/**
 * Work that the Storyboard's stage doesn't allow: the plan's Look and Beats are edited only until
 * the first Frame is written, and a Frame is edited or rendered only once written.
 */
export class StageError extends Error {}

/** A Frame's sentences are written: it has a prompt, and can be edited and rendered. */
export const isWritten = (frame: StoryboardFrame) => frame.body !== ''

/** Some Frame is written: the Look and Beats are fixed until a Restart. */
export const writingStarted = (session: StoryboardSession) => session.frames.some(isWritten)

/** A Frame of the plan, before its sentences are written: a Beat, who it shows, no prompt yet. */
function plannedFrame(look: Look, index: number, beat: string, shown: string[]): StoryboardFrame {
  return {
    index,
    beat,
    body: '',
    shown: matchShown(look.subjects, shown),
    prompt: '',
    pictures: [],
    createdAt: new Date().toISOString(),
  }
}

/**
 * A Frame with its sentences written, marking it blocked (unrenderable until edited) if its prompt
 * crosses a Limit.
 */
function makeFrame(
  look: Look,
  frame: StoryboardFrame,
  body: string,
  shown: string[],
  timings: FrameTimings | undefined = frame.timings,
): StoryboardFrame {
  const names = matchShown(look.subjects, shown)
  const prompt = composePrompt(look, body, names)
  const blocked = crossedLimit(prompt)?.message
  return {
    index: frame.index,
    beat: frame.beat,
    body,
    shown: names,
    prompt,
    pictures: frame.pictures,
    ...(timings ? { timings } : {}),
    ...(blocked ? { blocked } : {}),
    createdAt: frame.createdAt,
  }
}

/**
 * A written Frame after its sentences or who it shows changed: the same pictures, marked stale if
 * its Image Prompt changed.
 */
function recompose(
  frame: StoryboardFrame,
  look: Look,
  body = frame.body,
  shown = frame.shown,
): StoryboardFrame {
  const fresh = makeFrame(look, frame, body, shown)
  // The pictures, and what was made from them, stay until rendered again.
  return {
    ...fresh,
    pictures: fresh.prompt === frame.prompt ? frame.pictures : allStale(frame.pictures),
  }
}

function checkLook(look: Look): void {
  const limit = lookLimit(look)
  if (limit) throw new LimitError(`The Look crosses a limit: ${limit}`)
}

/** Refuses a change to the plan once a Frame is written. */
function checkPlanOpen(session: StoryboardSession): void {
  if (writingStarted(session)) {
    throw new StageError(
      'The Look and Beats are fixed once Frames are written: restart the Storyboard to change them',
    )
  }
}

/** Refuses work on a Frame whose sentences aren't written yet. */
function checkWritten(session: StoryboardSession, index: number): StoryboardFrame {
  const frame = session.frames[index]
  if (!frame || !session.look) throw new Error(`There is no ${frameName(index)}`)
  if (!isWritten(frame)) throw new StageError(`${frameName(index)} isn't written yet`)
  return frame
}

/**
 * Plans an empty Storyboard in one Text Model call: the Look, then the Beats (who each shows),
 * reported as they arrive, for the player to review before the Frames are written
 * (`writeStoryboard`). Commits all or nothing: on failure or Cancel nothing is saved.
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

  let look: Look | null = null
  const plan = await withRetry(
    (onThinking) =>
      deps.textModel.planStoryboard(
        { scenario, frameCount: session.frameCount },
        signal,
        {
          thinking: onThinking,
          look: (l) => {
            look = l
            emit({ type: 'look', look: l })
          },
          beat: (index, { beat, shown }) => {
            if (look) {
              emit({ type: 'planned-beat', index, beat, shown: matchShown(look.subjects, shown) })
            }
          },
        },
      ),
    signal,
    emit,
  )
  checkLook(plan.look)
  signal.throwIfAborted()

  const planned: StoryboardSession = {
    ...session,
    look: plan.look,
    frames: plan.beats.map(({ beat, shown }, i) => plannedFrame(plan.look, i, beat, shown)),
  }
  await deps.store.save(planned)
  emit({ type: 'planned', session: planned })
  return planned
}

/**
 * Writes the Frames of a reviewed plan, a call per Frame: each is given every Beat and the Frames
 * before it, and saved as it comes, so a failure or Cancel keeps those written; writing again
 * carries on from the first not written. The Beats are checked with the Limits first, as an Action
 * is. Once a Frame is written, the Look and Beats are fixed until a Restart.
 */
export async function writeStoryboard(
  deps: FrameDeps,
  session: StoryboardSession,
  scenario: Scenario,
  emit: (event: StoryboardEvent) => void,
  signal: AbortSignal,
): Promise<StoryboardSession> {
  const look = session.look
  if (!look || session.frames.length === 0) throw new StageError('Plan the Storyboard first')
  const from = session.frames.findIndex((f) => !isWritten(f))
  if (from < 0) throw new StageError('Every Frame is written already')
  emit({ type: 'phase', phase: 'text' })
  checkLook(look)
  const beatLimit = await limitCrossedBy(
    session.frames.map((f) => f.beat).join('\n'),
    deps.textModel,
    signal,
  )
  if (beatLimit) throw new LimitError(`A Beat crosses a limit: ${beatLimit}`)

  const beats: PlannedBeat[] = session.frames.map(({ beat, shown }) => ({ beat, shown }))
  let latest = session
  for (let index = from; index < session.frames.length; index++) {
    signal.throwIfAborted()
    const start = performance.now()
    const before = latest.frames.slice(0, index).map((f) => f.body)
    const { body } = await logCallsUnder(index, () =>
      withRetry(
        (onThinking) =>
          deps.textModel.writeStoryboardFrame(
            { scenario, look, beats, index, before },
            signal,
            onThinking,
          ),
        signal,
        emit,
      ))
    signal.throwIfAborted()
    const frame = makeFrame(look, latest.frames[index], body, latest.frames[index].shown, {
      text: secondsSince(start),
    })
    latest = await updateSession(deps.store, session.id, 'storyboard', (s) => ({
      ...s,
      frames: s.frames.map((f) => f.index === index ? frame : f),
    }))
    emit({ type: 'written-frame', frame })
  }
  emit({ type: 'written', session: latest })
  return latest
}

/**
 * Takes a Storyboard back to its plan: every Frame's sentences and pictures go (their files
 * deleted), its Beat and who it shows stay, and the Look and Beats can be edited again.
 */
export async function restartStoryboard(
  deps: Pick<FrameDeps, 'store'>,
  session: StoryboardSession,
): Promise<StoryboardSession> {
  let files: string[] = []
  const updated = await updateSession(deps.store, session.id, 'storyboard', (latest) => {
    files = latest.frames.flatMap(allPictureFiles)
    return {
      ...latest,
      frames: latest.frames.map((f) => ({
        index: f.index,
        beat: f.beat,
        body: '',
        shown: f.shown,
        prompt: '',
        pictures: [],
        createdAt: f.createdAt,
      })),
    }
  })
  await removeFiles(deps.store.dir(session.id), files)
  return updated
}

/**
 * Renders (or re-renders) one Frame, in place of its picture by the same Image Model
 * (`replacePicture`). Nothing changes unless the render completes. Saved onto the Storyboard as it
 * is now, as a queued job runs beside edits: a Frame edited meanwhile keeps its new sentences, and
 * the new picture is marked stale.
 */
export async function renderStoryboardFrame(
  deps: FrameDeps,
  session: StoryboardSession,
  index: number,
  emit: (event: StoryboardEvent) => void,
  signal: AbortSignal,
): Promise<StoryboardFrame> {
  const frame = checkWritten(session, index)
  if (frame.blocked) throw new LimitError(`${frameName(index)} crosses a limit: ${frame.blocked}`)

  const { frame: rendered } = await replacePicture(
    deps,
    session,
    index,
    frame.prompt,
    emit,
    signal,
    (change) => updateSession(deps.store, session.id, 'storyboard', change),
  )
  emit({ type: 'rendered', frame: rendered })
  return rendered
}

/**
 * Replaces one written Frame's own sentences, typed by hand, and who it shows if given. Refused if
 * the result crosses a Limit.
 */
export async function setFrameBody(
  deps: Pick<FrameDeps, 'store'>,
  session: StoryboardSession,
  index: number,
  body: string,
  shown?: string[],
): Promise<StoryboardSession> {
  checkWritten(session, index)
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
 * Replaces one Beat of the plan, typed by hand, and who it shows if given; only before the Frames
 * are written. Refused if it crosses a Limit.
 */
export async function setBeat(
  deps: Pick<FrameDeps, 'store'>,
  session: StoryboardSession,
  index: number,
  beat: string,
  shown?: string[],
): Promise<StoryboardSession> {
  const frame = session.frames[index]
  if (!frame || !session.look) throw new Error(`There is no ${frameName(index)}`)
  checkPlanOpen(session)
  const line = beat.trim().replace(/\s+/g, ' ')
  if (!line) throw new Error('A Beat needs a line')
  const limit = crossedLimit(line)?.message
  if (limit) throw new LimitError(`That crosses a limit: ${limit}`)
  return await updateSession(deps.store, session.id, 'storyboard', (latest) => {
    checkPlanOpen(latest)
    const names = matchShown(latest.look!.subjects, shown ?? latest.frames[index].shown)
    return {
      ...latest,
      frames: latest.frames.map((f) => f.index === index ? { ...f, beat: line, shown: names } : f),
    }
  })
}

/** Storyboards plan between 1 and 32 Frames; 8 unless asked otherwise. */
export const FRAME_COUNT = { min: 1, max: 32, default: 8 }

/**
 * Adds a Beat to the plan, typed by hand, at `at` (0 to the number of Frames): the Frames from
 * there on move up one. It shows who it's given, else who the Frame before it shows (the one after,
 * at the start). Only before the Frames are written; refused if it crosses a Limit.
 */
export async function insertBeat(
  deps: Pick<FrameDeps, 'store'>,
  session: StoryboardSession,
  at: number,
  beat: string,
  shown?: string[],
): Promise<StoryboardSession> {
  if (!session.look || session.frames.length === 0) {
    throw new StageError('Plan the Storyboard first')
  }
  checkPlanOpen(session)
  const line = beat.trim().replace(/\s+/g, ' ')
  if (!line) throw new Error('A Beat needs a line')
  const limit = crossedLimit(line)?.message
  if (limit) throw new LimitError(`That crosses a limit: ${limit}`)
  const updated = await updateSession(deps.store, session.id, 'storyboard', (latest) => {
    checkPlanOpen(latest)
    if (!Number.isInteger(at) || at < 0 || at > latest.frames.length) {
      throw new Error(`A Beat goes at 1 to ${latest.frames.length + 1}`)
    }
    if (latest.frames.length >= FRAME_COUNT.max) {
      throw new StageError(`A Storyboard has at most ${FRAME_COUNT.max} Frames`)
    }
    const beside = latest.frames[at - 1] ?? latest.frames[at]
    const added = plannedFrame(latest.look!, at, line, shown ?? beside.shown)
    const frames = [...latest.frames.slice(0, at), added, ...latest.frames.slice(at)]
    return { ...latest, frames: frames.map((f, index) => ({ ...f, index })) }
  })
  // A Storyboard restarted keeps the call log of its writing, which follows its Frame.
  await makeRoomInCallLogs(deps.store.dir(session.id), at)
  return updated
}

/**
 * Removes Beat `index` from the plan, the Frames after it moving down one; only before the Frames
 * are written, and not the last one left. `seen` is the plan as the player saw it: how many Frames
 * it had and when this one was made, so a repeated request can't remove the Beat that took its
 * place.
 */
export async function removeBeat(
  deps: Pick<FrameDeps, 'store'>,
  session: StoryboardSession,
  index: number,
  seen: { frames: number; createdAt: string },
): Promise<StoryboardSession> {
  checkPlanOpen(session)
  const updated = await updateSession(deps.store, session.id, 'storyboard', (latest) => {
    checkPlanOpen(latest)
    const gone = latest.frames[index]
    if (!gone || gone.createdAt !== seen.createdAt || latest.frames.length !== seen.frames) {
      throw new GoneError('That Beat is no longer there')
    }
    if (latest.frames.length === 1) throw new StageError('A Storyboard needs at least one Beat')
    return {
      ...latest,
      frames: latest.frames.filter((f) => f !== gone).map((f, i) => ({ ...f, index: i })),
    }
  })
  await renumberCallLogs(deps.store.dir(session.id), index)
  return updated
}

/**
 * Puts the plan's Beats in a new `order`: the index each had, in its new place. `seen` is each
 * Beat's line as the player saw them, in their old order, so an order made from a plan changed
 * meanwhile (in another tab) is refused rather than shuffling the wrong Beats. Only before the
 * Frames are written.
 */
export async function reorderBeats(
  deps: Pick<FrameDeps, 'store'>,
  session: StoryboardSession,
  order: number[],
  seen: string[],
): Promise<StoryboardSession> {
  checkPlanOpen(session)
  const updated = await updateSession(deps.store, session.id, 'storyboard', (latest) => {
    checkPlanOpen(latest)
    const n = latest.frames.length
    if (order.length !== n || [...order].sort((a, b) => a - b).some((i, k) => i !== k)) {
      throw new Error(`An order of the Beats has each of 0 to ${n - 1} once`)
    }
    if (seen.length !== n || latest.frames.some((f, i) => f.beat !== seen[i])) {
      throw new GoneError('The Beats have changed since: look again, then move them')
    }
    return { ...latest, frames: order.map((from, index) => ({ ...latest.frames[from], index })) }
  })
  await reorderCallLogs(deps.store.dir(session.id), order)
  return updated
}

/**
 * Replaces the Look, typed by hand; only before the Frames are written. A person renamed in place
 * stays shown where they were.
 */
export async function setLook(
  deps: Pick<FrameDeps, 'store'>,
  session: StoryboardSession,
  look: Look,
): Promise<StoryboardSession> {
  checkPlanOpen(session)
  const clean = cleanLook(look)
  checkLook(clean)
  return await updateSession(deps.store, session.id, 'storyboard', (latest) => {
    checkPlanOpen(latest)
    return {
      ...latest,
      look: clean,
      frames: latest.frames.map((f) => ({
        ...f,
        shown: renameShown(latest.look!.subjects, clean.subjects, f.shown),
      })),
    }
  })
}

export interface StoryboardEditResult {
  outcome: Outcome
  narration: string
  session: StoryboardSession
}

/**
 * Edits one written Frame through the Text Model, following an Action: its sentences and who it
 * shows, from the Look's Subjects. The Look is fixed, so an Action that would change it comes back
 * unclear. Declined or unclear Actions change nothing.
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
  const frame = checkWritten(session, index)
  const look = session.look!
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
          look,
          index,
          body: frame.body,
          shown: shownSubjects(look, frame.shown).map((p) => p.name),
          action,
        },
        signal,
        onThinking,
      ),
    signal,
    emit,
  )
  if (edit.outcome !== 'done') return unchanged(edit.outcome, edit.narration)

  const edited = recompose(frame, look, edit.body, edit.shown)
  if (edited.blocked) return unchanged('declined', `Declined: ${edited.blocked}.`)
  signal.throwIfAborted()
  // Onto the Storyboard as it is now: a queued render may have finished meanwhile.
  const updated = await updateSession(deps.store, session.id, 'storyboard', (latest) => ({
    ...latest,
    frames: latest.frames.map((f) =>
      f.index === index
        ? { ...recompose(f, look, edit.body, edit.shown), timings: { text: secondsSince(start) } }
        : f
    ),
  }))
  return { outcome: 'done', narration: edit.narration, session: updated }
}
