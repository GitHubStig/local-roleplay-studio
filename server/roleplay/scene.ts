import { join } from '@std/path'
import { secondsSince } from '../frames.ts'
import { RenderQueue } from '../renderQueue.ts'
import type { SceneMaker } from '../scene.ts'
import type { SessionStore } from '../session.ts'
import type { RoleplaySession, Scene } from './types.ts'
import { updateSession } from './update.ts'

export interface SceneDeps {
  store: SessionStore
  /** SHARP, when 3D scenes are available. */
  scene?: SceneMaker
  renderQueue?: RenderQueue
}

export type SceneEvent =
  | { type: 'phase'; phase: 'queued' | 'image' | 'download' }
  | { type: 'scened'; index: number; scene: Scene; session: RoleplaySession }

export class SceneError extends Error {}

/**
 * Makes Frame `index`'s picture into a 3D scene, in its turn behind any render: SHARP and an Image
 * Model each want 15 GB or more. Making it again replaces the old one.
 */
export async function makeScene(
  deps: SceneDeps,
  session: RoleplaySession,
  index: number,
  emit: (event: SceneEvent) => void,
  signal: AbortSignal,
): Promise<RoleplaySession> {
  if (!deps.scene) throw new SceneError('3D scenes are off (SCENES=off)')
  const image = session.frames[index]?.image
  if (!image) throw new SceneError(`Frame ${index} has no picture yet`)
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
      { image: join(dir, image), out: join(dir, file) },
      signal,
      (downloading) => emit({ type: 'phase', phase: downloading ? 'download' : 'image' }),
    )
    signal.throwIfAborted()
    const scene: Scene = {
      file,
      ...made,
      timings: { ...(queued !== undefined ? { queued } : {}), scene: secondsSince(began) },
    }
    let replaced: string | undefined
    // Onto the Frame as it is now, if it still shows the picture the scene was made from.
    const updated = await updateSession(deps.store, session.id, (latest) => {
      const current = latest.frames[index]
      if (current?.image !== image) throw new SceneError(`Frame ${index}'s picture changed`)
      replaced = current.scene?.file
      return {
        ...latest,
        frames: latest.frames.map((f) => (f.index === index ? { ...f, scene } : f)),
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
