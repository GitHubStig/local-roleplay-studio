/**
 * What a Roleplay's background work does (see `SessionJobs` in jobs.ts): pictures and renders its
 * Frames, directs their music (or scores it all with hindsight), upscales them, designs and speaks the Character's voice, and makes
 * its pictures into 3D.
 */
import { frameName } from '../frames.ts'
import { error } from '../http.ts'
import type { Job, JobEmit, JobKind } from '../jobs.ts'
import type { Upscaler } from '../images/upscalers.ts'
import type { ClipSize } from '../video/videoGenerator.ts'
import type { Scenario } from '../scenario.ts'
import type { Session, SessionStore } from '../session.ts'
import { pictureFrame, renderRoleplayFrame, type RoleplayDeps } from './engine.ts'
import { directFrame } from './director.ts'
import { scoreRoleplay } from './hindsight.ts'
import type { RoleplaySession } from './types.ts'
import { checkPictureJob, PICTURE_JOB_KINDS, runPictureJob } from '../pictureJobs.ts'
import { designVoice, speakFrame, spokenText } from './voice.ts'
import { updateSession } from './update.ts'

export interface RoleplayJobContext {
  store: SessionStore
  deps(session: Session): RoleplayDeps
  scenarioFor(session: Session): Scenario | Response
  /** The upscaler chosen in Settings now. */
  upscaler(): Promise<Upscaler>
  /** The video model chosen in Settings now. */
  videoModel(): Promise<string>
  /** The clip size chosen in Settings now for a video model; none for the model's own. */
  videoSize(model: string): Promise<ClipSize | undefined>
}

/** Why `kind` can't be queued on a Roleplay's Frame `index`, or null if it can. */
export function checkRoleplayJob(
  session: RoleplaySession,
  kind: JobKind,
  index: number,
  pending: readonly JobKind[],
): Response | null {
  if (kind === 'speak' && !spokenText(session.frames[index], 'dialogue')) {
    return error(`${frameName(index)} has nothing to say aloud`, 409)
  }
  if (kind === 'speak-thought' && !spokenText(session.frames[index], 'thought')) {
    return error(`${frameName(index)} has no thought to say aloud`, 409)
  }
  if (PICTURE_JOB_KINDS.includes(kind)) {
    return checkPictureJob(session, index, kind, frameName(index), pending)
  }
  return null
}

/** Does one of a Roleplay's jobs. */
export async function runRoleplayJob(
  ctx: RoleplayJobContext,
  session: RoleplaySession,
  job: Job,
  emit: JobEmit,
  signal: AbortSignal,
): Promise<void> {
  const withDeps = ctx.deps(session)
  /** Saves onto the Roleplay as it is now: the conversation may have moved on meanwhile. */
  const save = (change: (s: RoleplaySession) => RoleplaySession) =>
    updateSession(withDeps.store, session.id, change)
  if (job.kind === 'direct' || job.kind === 'score-roleplay') {
    const scenario = ctx.scenarioFor(session)
    if (scenario instanceof Response) throw new Error((await scenario.json()).error)
    const deps = { store: withDeps.store, model: withDeps.roleplayModel }
    if (job.kind === 'direct') {
      await directFrame(deps, session, scenario, job.frameIndex, emit, signal)
    } else await scoreRoleplay(deps, session, scenario, emit, signal)
  } else if (job.kind === 'picture') {
    const scenario = ctx.scenarioFor(session)
    if (scenario instanceof Response) throw new Error((await scenario.json()).error)
    await pictureFrame(withDeps, session, scenario, job.frameIndex, emit, signal)
  } else if (job.kind === 'voice' || job.kind === 'speak' || job.kind === 'speak-thought') {
    const voiceDeps = { ...withDeps, model: withDeps.roleplayModel }
    if (job.kind === 'voice') await designVoice(voiceDeps, session, emit, signal)
    else {
      const part = job.kind === 'speak-thought' ? 'thought' : 'dialogue'
      await speakFrame(voiceDeps, session, job.frameIndex, emit, signal, part)
    }
  } else if (job.kind === 'render') {
    await renderRoleplayFrame(withDeps, session, job.frameIndex, emit, signal)
  } else {
    await runPictureJob(
      { ...withDeps, upscaler: ctx.upscaler, videoModel: ctx.videoModel, videoSize: ctx.videoSize },
      session,
      job,
      emit,
      signal,
      save,
    )
  }
}
