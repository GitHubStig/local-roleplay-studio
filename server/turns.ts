import { join } from '@std/path'
import type { ImageGenerator } from './imageGenerator.ts'
import type { Scenario } from './scenario.ts'
import { currentScene, type Session, type SessionStore, type Turn } from './session.ts'
import type { TextModel, TurnText } from './textModel.ts'

/** Progress of a Turn, streamed to the player as it happens. */
export type TurnEvent =
  | { type: 'phase'; phase: 'text' | 'image' }
  /** The new Scene before its image exists; provisional until `committed`. */
  | { type: 'text'; narration: string; declined: boolean; scene: Turn['scene'] }
  | { type: 'committed'; turn: Turn }

export interface TurnDeps {
  store: SessionStore
  textModel: TextModel
  imageGenerator: ImageGenerator
}

const TEXT_ATTEMPTS = 2

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
 * Runs one Turn: Text Model, then Image Model, then commit. The Turn commits whole or not at
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

  // The engine, not the Text Model, guarantees a declined Direction changes nothing.
  const declined = previous !== undefined && text.declined
  const nextScene = declined ? previous.scene : text.scene
  emit({ type: 'text', narration: text.narration, declined, scene: nextScene })

  const dir = deps.store.dir(session.id)
  let image: string
  let imagePrompt: string
  let wroteImage = false
  try {
    if (declined) {
      image = previous.image
      imagePrompt = previous.imagePrompt
    } else {
      emit({ type: 'phase', phase: 'image' })
      imagePrompt = `${scenario.imagePrefix}, ${text.imagePrompt}`
      signal.throwIfAborted()
      await Deno.mkdir(dir, { recursive: true })
      image = await deps.imageGenerator.generate({
        prompt: imagePrompt,
        seed: session.seed,
        settings: session.settings,
        dir,
        name: `turn-${index}`,
      }, signal)
      wroteImage = true
    }
    signal.throwIfAborted()

    const turn: Turn = {
      index,
      action,
      scene: nextScene,
      narration: text.narration,
      declined,
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
