import { join } from '@std/path'
import { saveAsGiven, secondsSince } from '../frames.ts'
import { RenderQueue } from '../renderQueue.ts'
import type { Scene, SceneMaker } from '../scene.ts'
import type { SessionStore } from '../session.ts'

export interface SceneDeps {
  store: SessionStore
  /** SHARP, when 3D scenes are available. */
  scene?: SceneMaker
  renderQueue?: RenderQueue
}

/** What a scene can be made for: a Chain or a Roleplay. */
interface ScenedSession {
  id: string
  frames: { index: number; image: string | null; upscaled?: string; scene?: Scene }[]
}

export type SceneEvent<S = ScenedSession> =
  | { type: 'phase'; phase: 'queued' | 'image' | 'download' }
  | { type: 'scened'; index: number; scene: Scene; session: S }

export class SceneError extends Error {}

/** Why no scene can be made: SHARP is switched off. */
export const SCENES_OFF = '3D scenes are off (SCENES=off)'

/**
 * Makes Frame `index`'s picture into a 3D scene, in its turn behind any render: SHARP and an Image
 * Model each want 15 GB or more. Made from the upscale if the Frame has one, else the original.
 * Every Frame showing that picture gets it (a Chain Frame reuses the picture before it when nothing
 * changed). Making it again replaces the old one.
 */
export async function makeScene<S extends ScenedSession>(
  deps: SceneDeps,
  session: S,
  index: number,
  emit: (event: SceneEvent<S>) => void,
  signal: AbortSignal,
  save: (change: (s: S) => S) => Promise<S> = saveAsGiven(deps.store, session),
): Promise<S> {
  if (!deps.scene) throw new SceneError(SCENES_OFF)
  const frame = session.frames[index]
  const image = frame?.image
  if (!image) throw new SceneError(`Frame ${index} has no picture yet`)
  // SHARP works at 1536 px: the 2048 px upscale has more to give it than a 1024 px original.
  const from = frame.upscaled ?? image
  const dir = deps.store.dir(session.id)
  const file = `scene-${index}-${crypto.randomUUID().slice(0, 8)}.ply`
  const start = performance.now()
  let waited = false
  const release = await (deps.renderQueue ?? new RenderQueue()).acquire(signal, () => {
    waited = true
    emit({ type: 'phase', phase: 'queued' })
  })
  try {
    const queued = waited ? secondsSince(start) : undefined
    emit({ type: 'phase', phase: 'image' })
    const began = performance.now()
    const made = await deps.scene.make(
      { image: join(dir, from), out: join(dir, file) },
      signal,
      (downloading) => emit({ type: 'phase', phase: downloading ? 'download' : 'image' }),
    )
    signal.throwIfAborted()
    const scene: Scene = {
      file,
      from,
      ...made,
      timings: { ...(queued !== undefined ? { queued } : {}), scene: secondsSince(began) },
    }
    let replaced: string | undefined
    // Onto the Frame as it is now, if it still shows the picture the scene was made from.
    const updated = await save((latest) => {
      const current = latest.frames[index]
      if (current?.image !== image) throw new SceneError(`Frame ${index}'s picture changed`)
      replaced = current.scene?.file
      return {
        ...latest,
        frames: latest.frames.map((f) => (f.image === image ? { ...f, scene } : f)),
      }
    })
    if (replaced) await Deno.remove(join(dir, replaced)).catch(() => {})
    emit({ type: 'scened', index, scene, session: updated })
    return updated
  } catch (err) {
    await Deno.remove(join(dir, file)).catch(() => {})
    throw err
  } finally {
    release()
  }
}
