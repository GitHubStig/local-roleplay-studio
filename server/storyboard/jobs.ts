/**
 * What a Storyboard's background work does (see `SessionJobs` in jobs.ts): renders its Frames, and
 * the picture jobs every kind of Session has (`pictureJobs.ts`), queued so the player can carry on
 * editing meanwhile.
 */
import type { FrameDeps } from '../frames.ts'
import { error } from '../http.ts'
import type { Job, JobEmit, JobKind } from '../jobs.ts'
import {
  checkPictureJob,
  PICTURE_JOB_KINDS,
  type PictureJobDeps,
  runPictureJob,
} from '../pictureJobs.ts'
import type { StoryboardSession } from '../session.ts'
import { updateSession } from '../update.ts'
import { renderStoryboardFrame } from './storyboard.ts'

/** Why `kind` can't be queued on a Storyboard's Frame `index`, or null if it can. */
export function checkStoryboardJob(
  session: StoryboardSession,
  kind: JobKind,
  index: number,
  pending: readonly JobKind[],
): Response | null {
  const frame = session.frames[index]
  if (kind === 'render') {
    return frame.blocked ? error(`Frame ${index + 1} crosses a limit: ${frame.blocked}`, 422) : null
  }
  if (!PICTURE_JOB_KINDS.includes(kind)) return error(`A Storyboard has no ${kind} jobs`, 409)
  return checkPictureJob(session, index, kind, `Frame ${index + 1}`, pending)
}

/** Does one of a Storyboard's jobs, saving onto it as it is now (it may have been edited). */
export async function runStoryboardJob(
  deps: PictureJobDeps & FrameDeps,
  session: StoryboardSession,
  job: Job,
  emit: JobEmit,
  signal: AbortSignal,
): Promise<void> {
  if (job.kind === 'render') {
    await renderStoryboardFrame(deps, session, job.frameIndex, emit, signal)
    return
  }
  await runPictureJob(
    deps,
    session,
    job,
    emit,
    signal,
    (change) => updateSession(deps.store, session.id, 'storyboard', change),
  )
}
