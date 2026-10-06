import { join } from '@std/path'
import type { Figure, FigureMaker } from './figure.ts'
import { secondsSince } from '../frames.ts'
import { RenderQueue } from '../renderQueue.ts'
import type { SessionStore } from '../session.ts'

export interface FigureDeps {
  store: SessionStore
  /** TripoSplat, when 3D figures are available. */
  figure?: FigureMaker
  /** Apple's LiTo, when its figures are available. */
  lito?: FigureMaker
  renderQueue?: RenderQueue
}

/** What a figure can be made for: any kind of Session with pictures. */
interface FiguredSession {
  id: string
  frames: {
    index: number
    image: string | null
    upscaled?: string
    figure?: Figure
    lito?: Figure
  }[]
}

export type FigureEvent<S = FiguredSession> =
  | { type: 'phase'; phase: 'queued' | 'image' | 'download' }
  | { type: 'figured'; index: number; model: FigureModel; figure: Figure; session: S }

/** Which model makes a figure, and where on the Frame it's kept. */
export type FigureModel = 'triposplat' | 'lito'
export const FIGURE_MODELS = {
  triposplat: { key: 'figure', prefix: 'figure', off: "TripoSplat isn't set up on this server" },
  lito: { key: 'lito', prefix: 'lito', off: "LiTo isn't set up on this server" },
} as const

export class FigureError extends Error {}

/**
 * Lifts the person in Frame `index`'s picture out as a full 3D figure with TripoSplat or Apple's LiTo
 * (from its upscale if it has one), in its turn behind any render, replacing the one it had. Every
 * Frame showing that picture gets it (a Chain Frame reuses the picture before it).
 * Anyone overlapping them takes parts of them away, and two people in the picture may come out as
 * one.
 */
export async function liftFigure<S extends FiguredSession>(
  deps: FigureDeps,
  session: S,
  index: number,
  emit: (event: FigureEvent<S>) => void,
  signal: AbortSignal,
  model: FigureModel,
  /** Saves the change onto the Session as it is now (`updateSession`). */
  save: (change: (s: S) => S) => Promise<S>,
): Promise<S> {
  const { key, prefix, off } = FIGURE_MODELS[model]
  const maker = deps[key]
  if (!maker) throw new FigureError(off)
  const frame = session.frames[index]
  const image = frame?.image
  if (!image) throw new FigureError(`Frame ${index} has no picture yet`)
  const from = frame.upscaled ?? image
  const dir = deps.store.dir(session.id)
  const file = `${prefix}-${index}-${crypto.randomUUID().slice(0, 8)}.ply`
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
    const { splats } = await maker.make(
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
    const updated = await save((latest) => {
      const current = latest.frames[index]
      if (current?.image !== image) throw new FigureError(`Frame ${index}'s picture changed`)
      replaced = current[key]?.file
      return {
        ...latest,
        frames: latest.frames.map((f) => (f.image === image ? { ...f, [key]: figure } : f)),
      }
    })
    if (replaced) await Deno.remove(join(dir, replaced)).catch(() => {})
    emit({ type: 'figured', index, model, figure, session: updated })
    return updated
  } catch (err) {
    await Deno.remove(join(dir, file)).catch(() => {})
    throw err
  } finally {
    release()
  }
}
