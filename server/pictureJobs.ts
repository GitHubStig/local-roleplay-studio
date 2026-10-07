/**
 * The jobs every kind of Session runs on a Frame's picture, once it has one: an upscale, and 3D
 * (a SHARP scene, a TripoSplat or LiTo figure). A Chain has only these; a Storyboard adds
 * rendering, and a Roleplay pictures, renders and voices too (each in its `jobs.ts`).
 */
import type { FigureMaker } from './3d/figure.ts'
import { liftFigure } from './3d/liftFigure.ts'
import { makeScene } from './3d/makeScene.ts'
import type { SceneMaker } from './3d/scene.ts'
import { type FrameDeps, upscaleFrame } from './frames.ts'
import { error } from './http.ts'
import type { Upscaler } from './images/mflux/models.ts'
import type { Job, JobEmit, JobKind } from './jobs.ts'
import type { Session } from './session.ts'

export const PICTURE_JOB_KINDS: readonly JobKind[] = ['upscale', 'scene', 'figure', 'lito']

export interface PictureJobDeps
  extends Pick<FrameDeps, 'store' | 'imageGenerator' | 'renderQueue'> {
  scene?: SceneMaker
  figure?: FigureMaker
  lito?: FigureMaker
  /** The upscaler chosen in Settings now. */
  upscaler(): Promise<Upscaler>
}

/**
 * Why picture job `kind` can't be queued on `frame` (called `name`), or null if it can. Without a
 * picture it can still wait behind a job already queued (`pending`) that will make one, so a
 * render and what's made from it can be asked for back to back.
 */
export function checkPictureJob(
  frame: { image: string | null; upscaled?: string },
  kind: JobKind,
  name: string,
  pending: readonly JobKind[],
): Response | null {
  const coming = pending.some((k) => k === 'render' || k === 'picture')
  if (!frame.image && !coming) return error(`${name} has no picture yet`, 409)
  if (kind === 'upscale' && frame.upscaled) return error(`${name} is already upscaled`, 409)
  return null
}

/**
 * Does a picture job, saving through `save` onto the Session as it is now: the Session's own work
 * (the next Frame, an edit, the conversation) carries on beside it.
 */
export async function runPictureJob<S extends Session>(
  deps: PictureJobDeps,
  session: S,
  job: Job,
  emit: JobEmit,
  signal: AbortSignal,
  save: (change: (s: S) => S) => Promise<S>,
): Promise<void> {
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
      (change) => save((s) => change(s) as S),
    )
  } else if (job.kind === 'scene') {
    await makeScene(deps, session, index, emit, signal, save)
  } else if (job.kind === 'figure' || job.kind === 'lito') {
    const model = job.kind === 'lito' ? 'lito' : 'triposplat'
    await liftFigure(deps, session, index, emit, signal, model, save)
  } else {
    throw new Error(`${job.kind} isn't a picture job`)
  }
}
