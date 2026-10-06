/**
 * What a Chain's background work does (see `SessionJobs` in jobs.ts): upscales its pictures and
 * makes them into 3D, while the player carries on with the next Action.
 */
import { type FrameDeps, upscaleFrame } from '../frames.ts'
import type { FigureMaker } from '../3d/figure.ts'
import { error } from '../http.ts'
import type { Upscaler } from '../images/imageModels.ts'
import type { Job, JobEmit, JobKind } from '../jobs.ts'
import { liftFigure } from '../roleplay/figure.ts'
import { makeScene } from '../roleplay/scene.ts'
import type { SceneMaker } from '../3d/scene.ts'
import type { ChainSession, Session } from '../session.ts'
import { updateSession } from '../update.ts'

/** The jobs a Chain has. */
export const CHAIN_JOB_KINDS: readonly JobKind[] = ['upscale', 'scene', 'figure', 'lito']

export interface ChainJobDeps extends FrameDeps {
  scene?: SceneMaker
  figure?: FigureMaker
  lito?: FigureMaker
  /** The upscaler chosen in Settings now. */
  upscaler(): Promise<Upscaler>
}

/** Why `kind` can't be queued on a Chain's Frame `index`, or null if it can. */
export function checkChainJob(
  session: ChainSession,
  kind: JobKind,
  index: number,
): Response | null {
  if (!CHAIN_JOB_KINDS.includes(kind)) return error(`A Chain has no ${kind} jobs`, 409)
  if (kind === 'upscale' && session.frames[index].upscaled) {
    return error(`Frame ${index} is already upscaled`, 409)
  }
  return null
}

/** Does one of a Chain's jobs. */
export async function runChainJob(
  deps: ChainJobDeps,
  session: ChainSession,
  job: Job,
  emit: JobEmit,
  signal: AbortSignal,
): Promise<void> {
  /** Saves onto the Chain as it is now: it may have moved on a Frame or two meanwhile. */
  const save = (change: (s: ChainSession) => ChainSession) =>
    updateSession(deps.store, session.id, 'chain', change)
  const index = job.frameIndex
  if (job.kind === 'upscale') {
    const upscaler = await deps.upscaler()
    await upscaleFrame(
      deps,
      session,
      index,
      upscaler,
      emit,
      signal,
      (change) => save((s) => change(s as Session) as ChainSession),
    )
  } else if (job.kind === 'scene') {
    await makeScene(deps, session, index, emit, signal, save)
  } else {
    const model = job.kind === 'lito' ? 'lito' : 'triposplat'
    await liftFigure(deps, session, index, emit, signal, model, save)
  }
}
