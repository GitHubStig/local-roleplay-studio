import { join } from '@std/path'
import { secondsSince } from '../frames.ts'
import { RenderQueue } from '../renderQueue.ts'
import type { Scene, SceneMaker } from './scene.ts'
import type { Session, SessionStore } from '../session.ts'
import { changeFramePicture, shownPictureOf } from '../pictures.ts'

export interface SceneDeps {
  store: SessionStore
  /** SHARP, when 3D scenes are available. */
  scene?: SceneMaker
  renderQueue?: RenderQueue
}

export type SceneEvent<S = Session> =
  | { type: 'phase'; phase: 'queued' | 'image' | 'download' }
  | { type: 'scened'; index: number; scene: Scene; session: S }

export class SceneError extends Error {}

/** Why no scene can be made: SHARP is switched off. */
export const SCENES_OFF = "SHARP isn't set up on this server"

/**
 * Makes Frame `index`'s picture into a 3D scene, in its turn behind any render: SHARP and an Image
 * Model each want 15 GB or more. Made from the upscale if the Frame has one, else the original.
 * Making it again replaces the old one.
 */
export async function makeScene<S extends Session>(
  deps: SceneDeps,
  session: S,
  index: number,
  emit: (event: SceneEvent<S>) => void,
  signal: AbortSignal,
  /** Saves the change onto the Session as it is now (`updateSession`). */
  save: (change: (s: S) => S) => Promise<S>,
): Promise<S> {
  if (!deps.scene) throw new SceneError(SCENES_OFF)
  const picture = shownPictureOf(session, index)
  if (!picture) throw new SceneError(`Frame ${index} has no picture yet`)
  const { image } = picture
  // SHARP works at 1536 px: the 2048 px upscale has more to give it than a 1024 px original.
  const from = picture.upscaled ?? image
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
    // Onto the picture it was made from, if the Frame still has it.
    const updated = await save((latest) =>
      changeFramePicture(latest, index, image, (p) => {
        replaced = p.scene?.file
        return { ...p, scene }
      })
    )
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
