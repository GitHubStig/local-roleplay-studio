import { equal } from '@std/assert'
import { join } from '@std/path'
import type { ImageGenerator } from './imageGenerator.ts'
import type { Scenario } from './scenario.ts'
import {
  currentScene,
  type Outcome,
  type Session,
  type SessionStore,
  type Turn,
} from './session.ts'
import type { TextModel, TurnText } from './textModel.ts'

/** Progress of a Turn, streamed to the player as it happens. */
export type TurnEvent =
  | { type: 'phase'; phase: 'text' | 'image' }
  /** Image Model steps completed so far. */
  | { type: 'progress'; step: number; total: number }
  /** The new Scene before its image exists; provisional until `committed`. */
  | { type: 'text'; outcome: Outcome; narration: string; scene: Turn['scene'] }
  | { type: 'committed'; turn: Turn }

export interface TurnDeps {
  store: SessionStore
  textModel: TextModel
  imageGenerator: ImageGenerator
}

const TEXT_ATTEMPTS = 2

/**
 * Describes a Scene for the Image Model as labelled phrases, e.g. `camera angle: low`, so the
 * image always shows exactly the state that is carried to the next Turn.
 */
export function sceneToPrompt(scene: Turn['scene']): string {
  const phrases: string[] = []
  const visit = (value: unknown, label: string) => {
    if (Array.isArray(value)) {
      const items = value.filter((v) => typeof v === 'string' && v.trim())
      if (items.length) phrases.push(`${label}: ${items.join(', ')}`)
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, v] of Object.entries(value)) visit(v, label ? `${label} ${key}` : key)
    } else if (value !== null && value !== undefined && String(value).trim()) {
      phrases.push(`${label}: ${String(value).trim()}`)
    }
  }
  visit(scene, '')
  return phrases.join(', ')
}

async function writeText(
  textModel: TextModel,
  req: Parameters<TextModel['write']>[0],
  signal: AbortSignal,
): Promise<TurnText> {
  let lastError: unknown
  for (let attempt = 1; attempt <= TEXT_ATTEMPTS; attempt++) {
    try {
      return await textModel.write(req, signal)
    } catch (err) {
      if (signal.aborted) throw err
      lastError = err
    }
  }
  throw lastError
}

/**
 * Runs one Turn: Text Model, then Image Model (prompted from the Scene), then commit. The Turn commits whole or not at
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
  const scene = currentScene(session)
  const index = session.turns.length

  emit({ type: 'phase', phase: 'text' })
  const text = await writeText(deps.textModel, { scenario, scene, action }, signal)

  // The engine, not the Text Model, guarantees a declined or unclear Action changes nothing.
  // The Opening Turn always counts as done.
  const outcome: Outcome = previous === undefined ? 'done' : text.outcome
  const nextScene = outcome === 'done' ? text.scene : previous!.scene
  emit({ type: 'text', outcome, narration: text.narration, scene: nextScene })

  // Nothing to render if the Scene didn't change: declined, unclear, or a done Action that the
  // Text Model left without effect. Reuse the previous image.
  const reuseImage = previous !== undefined && equal(nextScene, previous.scene)

  const dir = deps.store.dir(session.id)
  let image: string
  let imagePrompt: string
  let wroteImage = false
  try {
    if (reuseImage) {
      image = previous!.image
      imagePrompt = previous!.imagePrompt
    } else {
      emit({ type: 'phase', phase: 'image' })
      imagePrompt = `${scenario.imagePrefix}, ${sceneToPrompt(nextScene)}`
      signal.throwIfAborted()
      await Deno.mkdir(dir, { recursive: true })
      image = await deps.imageGenerator.generate(
        {
          prompt: imagePrompt,
          seed: session.seed,
          settings: session.settings,
          dir,
          name: `turn-${index}`,
        },
        signal,
        (step, total) => emit({ type: 'progress', step, total }),
      )
      wroteImage = true
    }
    signal.throwIfAborted()

    const turn: Turn = {
      index,
      action,
      scene: nextScene,
      narration: text.narration,
      outcome,
      imagePrompt,
      image,
      createdAt: new Date().toISOString(),
    }
    await deps.store.save({ ...session, turns: [...session.turns, turn] })
    session.turns.push(turn)
    emit({ type: 'committed', turn })
    return turn
  } catch (err) {
    if (wroteImage) await Deno.remove(join(dir, image!)).catch(() => {})
    throw err
  }
}
