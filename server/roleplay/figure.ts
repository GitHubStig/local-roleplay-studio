import { join } from '@std/path'
import type { FigureMaker } from '../figure.ts'
import { secondsSince } from '../frames.ts'
import { RenderQueue } from '../renderQueue.ts'
import type { SessionStore } from '../session.ts'
import type { Figure, RoleplaySession } from './types.ts'
import { updateSession } from './update.ts'

export interface FigureDeps {
  store: SessionStore
  /** TripoSplat, when 3D figures are available. */
  figure?: FigureMaker
  renderQueue?: RenderQueue
}

export type FigureEvent =
  | { type: 'phase'; phase: 'queued' | 'image' | 'download' }
  | { type: 'figured'; index: number; figure: Figure; session: RoleplaySession }

export class FigureError extends Error {}

/**
 * Lifts the person in Frame `index`'s picture out as a full 3D figure with TripoSplat (from its
 * upscale if it has one), in its turn behind any render, replacing the one it had. Anyone
 * overlapping them takes parts of them away, and two people in the picture may come out as one.
 */
export async function liftFigure(
  deps: FigureDeps,
  session: RoleplaySession,
  index: number,
  emit: (event: FigureEvent) => void,
  signal: AbortSignal,
): Promise<RoleplaySession> {
  if (!deps.figure) throw new FigureError('3D figures are off (FIGURES=off)')
  const frame = session.frames[index]
  const image = frame?.image
  if (!image) throw new FigureError(`Frame ${index} has no picture yet`)
  const from = frame.upscaled ?? image
  const dir = deps.store.dir(session.id)
  const file = `figure-${index}-${crypto.randomUUID().slice(0, 8)}.ply`
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
    const { splats } = await deps.figure.make(
      { image: join(dir, from), out: join(dir, file) },
      signal,
      (downloading) => emit({ type: 'phase', phase: downloading ? 'download' : 'image' }),
    )
    signal.throwIfAborted()
    const figure: Figure = {
      file,
      splats,
      from,
      timings: { ...(queued !== undefined ? { queued } : {}), figure: secondsSince(began) },
    }
    let replaced: string | undefined
    // Onto the Frame as it is now, if it still shows the picture the figure was made from.
    const updated = await updateSession(deps.store, session.id, (latest) => {
      const current = latest.frames[index]
      if (current?.image !== image) throw new FigureError(`Frame ${index}'s picture changed`)
      replaced = current.figure?.file
      return {
        ...latest,
        frames: latest.frames.map((f) => (f.index === index ? { ...f, figure } : f)),
      }
    })
    if (replaced) await Deno.remove(join(dir, replaced)).catch(() => {})
    emit({ type: 'figured', index, figure, session: updated })
    return updated
  } catch (err) {
    await Deno.remove(join(dir, file)).catch(() => {})
    throw err
  } finally {
    release()
  }
}
