/**
 * What a Roleplay's background work does (see `SessionJobs` in jobs.ts): pictures and renders its
 * Frames, upscales them, designs and speaks the Character's voice, and makes its pictures into 3D.
 */
import { error } from '../http.ts'
import type { Job, JobEmit, JobKind } from '../jobs.ts'
import type { Upscaler } from '../images/mflux/models.ts'
import type { Scenario } from '../scenario.ts'
import type { Session, SessionStore } from '../session.ts'
import { pictureFrame, renderRoleplayFrame, type RoleplayDeps } from './engine.ts'
import type { RoleplayModel } from './model.ts'
import type { ArtStyle } from './art.ts'
import type { RoleplaySession } from './types.ts'
import { checkPictureJob, PICTURE_JOB_KINDS, runPictureJob } from '../pictureJobs.ts'
import { designVoice, speakFrame, spokenText } from './voice.ts'
import { updateSession } from './update.ts'

export interface RoleplayJobContext {
  store: SessionStore
  deps(session: Session): RoleplayDeps
  scenarioFor(session: Session): Promise<Scenario | Response>
  /** The upscaler chosen in Settings now. */
  upscaler(): Promise<Upscaler>
  /** The Art Agent's model chosen in Settings now, if one is; else pictures use the Text Model. */
  artModel(session: Session): Promise<RoleplayModel | undefined>
  /** Whether the Art Agent writes prose or tags, as chosen in Settings now. */
  artStyle(): Promise<ArtStyle>
}

/** Why `kind` can't be queued on a Roleplay's Frame `index`, or null if it can. */
export function checkRoleplayJob(
  session: RoleplaySession,
  kind: JobKind,
  index: number,
  pending: readonly JobKind[],
): Response | null {
  if (kind === 'speak' && !spokenText(session.frames[index], 'dialogue')) {
    return error(`Frame ${index} has nothing to say aloud`, 409)
  }
  if (kind === 'speak-thought' && !spokenText(session.frames[index], 'thought')) {
    return error(`Frame ${index} has no thought to say aloud`, 409)
  }
  if (PICTURE_JOB_KINDS.includes(kind)) {
    return checkPictureJob(session.frames[index], kind, `Frame ${index}`, pending)
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
  // The Art Agent's model pictures Frames, and describes the Character's voice as it does the Look.
  const artModel = ['picture', 'voice', 'speak', 'speak-thought'].includes(job.kind)
    ? await ctx.artModel(session)
    : undefined
  const artStyle = job.kind === 'picture' ? await ctx.artStyle() : undefined
  const withDeps = {
    ...ctx.deps(session),
    ...(artModel ? { artModel } : {}),
    ...(artStyle ? { artStyle } : {}),
  }
  /** Saves onto the Roleplay as it is now: the conversation may have moved on meanwhile. */
  const save = (change: (s: RoleplaySession) => RoleplaySession) =>
    updateSession(withDeps.store, session.id, change)
  if (job.kind === 'picture') {
    const scenario = await ctx.scenarioFor(session)
    if (scenario instanceof Response) throw new Error((await scenario.json()).error)
    await pictureFrame(withDeps, session, scenario, job.frameIndex, emit, signal)
  } else if (job.kind === 'voice' || job.kind === 'speak' || job.kind === 'speak-thought') {
    const voiceDeps = { ...withDeps, model: withDeps.artModel ?? withDeps.roleplayModel }
    if (job.kind === 'voice') await designVoice(voiceDeps, session, emit, signal)
    else {
      const part = job.kind === 'speak-thought' ? 'thought' : 'dialogue'
      await speakFrame(voiceDeps, session, job.frameIndex, emit, signal, part)
    }
  } else if (job.kind === 'render') {
    await renderRoleplayFrame(withDeps, session, job.frameIndex, emit, signal)
  } else {
    await runPictureJob({ ...withDeps, upscaler: ctx.upscaler }, session, job, emit, signal, save)
  }
}
