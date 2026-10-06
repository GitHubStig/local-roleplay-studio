/**
 * What a Chain's background work does (see `SessionJobs` in jobs.ts): only the picture jobs every
 * kind of Session has (`pictureJobs.ts`), while the player carries on with the next Action.
 */
import { error } from '../http.ts'
import type { Job, JobEmit, JobKind } from '../jobs.ts'
import {
  checkPictureJob,
  PICTURE_JOB_KINDS,
  type PictureJobDeps,
  runPictureJob,
} from '../pictureJobs.ts'
import type { ChainSession } from '../session.ts'
import { updateSession } from '../update.ts'

/** Why `kind` can't be queued on a Chain's Frame `index`, or null if it can. */
export function checkChainJob(
  session: ChainSession,
  kind: JobKind,
  index: number,
  pending: readonly JobKind[],
): Response | null {
  if (!PICTURE_JOB_KINDS.includes(kind)) return error(`A Chain has no ${kind} jobs`, 409)
  return checkPictureJob(session.frames[index], kind, `Frame ${index}`, pending)
}

/** Does one of a Chain's jobs, saving onto the Chain as it is now (it may have moved on). */
export function runChainJob(
  deps: PictureJobDeps,
  session: ChainSession,
  job: Job,
  emit: JobEmit,
  signal: AbortSignal,
): Promise<void> {
  return runPictureJob(
    deps,
    session,
    job,
    emit,
    signal,
    (change) => updateSession(deps.store, session.id, 'chain', change),
  )
}
