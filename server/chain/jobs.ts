/**
 * What a Chain's background work does (see `SessionJobs` in jobs.ts): renders a Frame made without
 * its picture, and the picture jobs every kind of Session has (`pictureJobs.ts`), while the player
 * carries on with the next Action.
 */
import { error } from '../http.ts'
import type { Job, JobEmit, JobKind } from '../jobs.ts'
import {
  checkPictureJob,
  PICTURE_JOB_KINDS,
  type PictureJobDeps,
  runPictureJob,
} from '../pictureJobs.ts'
import type { FrameDeps } from '../frames.ts'
import type { ChainSession } from '../session.ts'
import { canRenderChainFrame, renderChainFrame } from './frames.ts'
import { updateSession } from '../update.ts'

/** Why `kind` can't be queued on a Chain's Frame `index`, or null if it can. */
export function checkChainJob(
  session: ChainSession,
  kind: JobKind,
  index: number,
  pending: readonly JobKind[],
): Response | null {
  const frame = session.frames[index]
  // A Chain Frame's prompt never changes: only one without a picture, or with one by another Image
  // Model, renders.
  if (kind === 'render') {
    return canRenderChainFrame(session, frame)
      ? null
      : error(`Frame ${index} already has its picture`, 409)
  }
  if (!PICTURE_JOB_KINDS.includes(kind)) return error(`A Chain has no ${kind} jobs`, 409)
  return checkPictureJob(session, index, kind, `Frame ${index}`, pending)
}

/** Does one of a Chain's jobs, saving onto the Chain as it is now (it may have moved on). */
export async function runChainJob(
  deps: PictureJobDeps & FrameDeps,
  session: ChainSession,
  job: Job,
  emit: JobEmit,
  signal: AbortSignal,
): Promise<void> {
  if (job.kind === 'render') {
    await renderChainFrame(deps, session, job.frameIndex, emit, signal)
    return
  }
  await runPictureJob(
    deps,
    session,
    job,
    emit,
    signal,
    (change) => updateSession(deps.store, session.id, 'chain', change),
  )
}
