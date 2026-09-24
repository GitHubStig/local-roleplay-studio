import { equal } from '@std/assert'
import { join } from '@std/path'
import type { ImageGenerator } from './imageGenerator.ts'
import { type ImagePrompt, renderPrompt } from './imagePrompt.ts'
import { crossedLimit } from './limits.ts'
import { mightNameAPerson } from './textModel.ts'
import { RenderQueue } from './renderQueue.ts'
import type { Scenario } from './scenario.ts'
import {
  type Outcome,
  type Session,
  type SessionStore,
  type Turn,
  type TurnTimings,
} from './session.ts'
import type { TextModel, TurnText } from './textModel.ts'

/** Progress of a Turn, streamed to the player as it happens. */
export type TurnEvent =
  /** `queued`: waiting for another Session's render to finish. */
  | { type: 'phase'; phase: 'text' | 'queued' | 'image' }
  /** More of the Text Model's reasoning; `restart` when a retry starts reasoning afresh. */
  | { type: 'thinking'; text: string; restart?: boolean }
  /** Image Model steps completed so far. */
  | { type: 'progress'; step: number; total: number }
  /** The new Image Prompt before its image exists; provisional until `committed`. */
  | { type: 'text'; outcome: Outcome; narration: string; prompt: ImagePrompt }
  | { type: 'committed'; turn: Turn }

export interface TurnDeps {
  store: SessionStore
  textModel: TextModel
  imageGenerator: ImageGenerator
  /** Shared across Sessions so only one image renders at a time. */
  renderQueue?: RenderQueue
}

const TEXT_ATTEMPTS = 2

/** Seconds since `start` (a `performance.now()` reading), to one decimal place. */
const secondsSince = (start: number) => Math.round((performance.now() - start) / 100) / 10

/**
 * A fresh image file name (without extension) for Turn `index`. The random suffix means a name is
 * never reused after an Undo, so a browser can cache images forever without showing a stale one.
 */
export const imageName = (index: number) => `turn-${index}-${crypto.randomUUID().slice(0, 8)}`

async function writeText(
  textModel: TextModel,
  req: Parameters<TextModel['write']>[0],
  signal: AbortSignal,
  emit: (event: TurnEvent) => void,
): Promise<TurnText> {
  let lastError: unknown
  for (let attempt = 1; attempt <= TEXT_ATTEMPTS; attempt++) {
    let restart = attempt > 1
    try {
      return await textModel.write(req, signal, (text) => {
        emit({ type: 'thinking', text, ...(restart ? { restart } : {}) })
        restart = false
      })
    } catch (err) {
      if (signal.aborted) throw err
      lastError = err
    }
  }
  throw lastError
}

/**
 * Runs one Turn: Text Model, then Image Model (rendering the Image Prompt), then commit. The Turn commits whole or not at
 * all: on failure or abort the Session on disk is untouched and any image written is removed.
 */
export async function runTurn(
  deps: TurnDeps,
  session: Session,
  scenario: Scenario,
  action: string | null,
  emit: (event: TurnEvent) => void,
  signal: AbortSignal,
): Promise<Turn> {
  const previous = session.turns.at(-1)
  const index = session.turns.length

  emit({ type: 'phase', phase: 'text' })
  const textStart = performance.now()
  let outcome: Outcome
  let narration: string
  let nextPrompt: ImagePrompt
  let thinking: string | undefined

  // The engine, not the Text Model, enforces the limits (ADR 0002). An Action that plainly
  // crosses one is declined without asking the Text Model at all.
  let actionLimit = previous && action ? crossedLimit(action)?.message : undefined
  // Real people can't be caught by a term list: ask the Text Model a narrow yes/no question.
  if (previous && action && !actionLimit && mightNameAPerson(action)) {
    if (await deps.textModel.namesRealPerson(action, signal)) {
      actionLimit = 'no real, identifiable people'
    }
  }
  if (previous && actionLimit) {
    outcome = 'declined'
    narration = `Declined: ${actionLimit}.`
    nextPrompt = previous.prompt
  } else {
    const text = await writeText(
      deps.textModel,
      { scenario, prompt: previous?.prompt ?? null, action },
      signal,
      emit,
    )
    thinking = text.thinking
    const promptLimit = crossedLimit(renderPrompt(text.prompt))
    if (!previous) {
      // The Opening Turn always counts as done, so it can't be declined: it fails instead.
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
  const timings: TurnTimings = { text: secondsSince(textStart), image: null }

  // Nothing to render if the Image Prompt didn't change: declined, unclear, or a done Action the
  // Text Model left without effect. Reuse the previous image.
  const reuseImage = previous !== undefined && equal(nextPrompt, previous.prompt)

  const dir = deps.store.dir(session.id)
  let image: string
  let promptText: string
  // Named up front so a failed or cancelled Turn can remove whatever the generator wrote, even if
  // it finished writing just as the Turn was cancelled.
  const name = imageName(index)
  try {
    if (reuseImage) {
      image = previous!.image
      promptText = previous!.promptText
    } else {
      promptText = renderPrompt(nextPrompt)
      const queueStart = performance.now()
      let waited = false
      const release = await (deps.renderQueue ?? new RenderQueue()).acquire(
        signal,
        () => {
          waited = true
          emit({ type: 'phase', phase: 'queued' })
        },
      )
      if (waited) timings.queued = secondsSince(queueStart)
      const imageStart = performance.now()
      try {
        emit({ type: 'phase', phase: 'image' })
        await Deno.mkdir(dir, { recursive: true })
        image = await deps.imageGenerator.generate(
          {
            prompt: promptText,
            seed: session.seed,
            settings: session.settings,
            dir,
            name,
          },
          signal,
          (step, total) => emit({ type: 'progress', step, total }),
        )
        timings.image = secondsSince(imageStart)
      } finally {
        release()
      }
    }
    signal.throwIfAborted()

    const turn: Turn = {
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
    await deps.store.save({ ...session, turns: [...session.turns, turn] })
    session.turns.push(turn)
    emit({ type: 'committed', turn })
    return turn
  } catch (err) {
    for (const ext of ['png', 'svg']) {
      await Deno.remove(join(dir, `${name}.${ext}`)).catch(() => {})
    }
    throw err
  }
}

export class UndoError extends Error {}

/**
 * Removes the latest Turn, so the previous Turn's Scene is current again. `index` must name the
 * latest Turn, so a repeated request can't undo two. The Opening Turn can't be undone. The
 * image file is deleted only when no remaining Turn still shows it.
 */
export async function undoLatestTurn(
  store: SessionStore,
  session: Session,
  index: number,
): Promise<Session> {
  const latest = session.turns.at(-1)
  if (!latest || latest.index !== index) {
    throw new UndoError(`Turn ${index} is not the latest Turn`)
  }
  if (session.turns.length === 1) throw new UndoError("The Opening Turn can't be undone")

  const turns = session.turns.slice(0, -1)
  const updated: Session = { ...session, turns }
  await store.save(updated)
  if (!turns.some((t) => t.image === latest.image)) {
    await Deno.remove(join(store.dir(session.id), latest.image)).catch(() => {})
  }
  return updated
}
