import { DOWNLOADING, type ImageBackend, type Job, type JobKind, previewUrl } from './api'

/** What each job is called, on its Frame and in the queue. */
export const JOB_NAMES: Record<JobKind, string> = {
  picture: 'Picture',
  render: 'Render',
  upscale: 'Upscale',
  voice: 'Voice',
  speak: 'Listen',
  'speak-thought': 'Listen to thought',
  scene: 'SHARP',
  figure: 'TripoSplat',
  lito: 'LiTo',
}

/**
 * What a job is doing, in a few words. A Roleplay says more about its own work (voices, pictures)
 * through `special`, which answers first when it has something to say.
 */
export function jobStatus(job: Job, special?: (job: Job) => string | undefined): string {
  if (job.status === 'failed') return `Failed: ${job.error}`
  if (job.status === 'queued') return 'Queued'
  if (job.phase === 'download') return DOWNLOADING
  const said = special?.(job)
  if (said) return said
  if (job.phase === 'queued') return 'Waiting for another render…'
  if (job.kind === 'scene') return 'Making the 2.5D scene…'
  if (job.kind === 'figure' || job.kind === 'lito') return 'Making the 3D figure…'
  const doing = job.kind === 'upscale' ? 'Upscaling to 2048 px…' : 'Rendering…'
  return job.progress ? `${doing} step ${job.progress.step} of ${job.progress.total}` : doing
}

/**
 * How a picture's frame shows work on it (`FrameImage`'s `rendering`): waiting for another render,
 * or rendering (and downloading a model first); nothing for other phases.
 */
export function sweepOf(phase: string | null | undefined): 'queued' | 'image' | null {
  if (phase === 'queued') return 'queued'
  return phase === 'image' || phase === 'download' ? 'image' : null
}

/**
 * The picture forming, for `FrameImage`'s `preview`: the latest preview of a render on ComfyUI
 * (mflux sends none), more opaque as the steps go, since the first ones are dark smudges. Null
 * while it isn't rendering, or before the first step.
 */
export function formingOf(
  session: { id: string; settings: { imageBackend: ImageBackend } } | null | undefined,
  phase: string | null | undefined,
  progress: { step: number; total: number } | null | undefined,
): { src: string; opacity: number } | null {
  if (session?.settings.imageBackend !== 'comfyui' || phase !== 'image' || !progress) return null
  return { src: previewUrl(session.id, progress.step), opacity: progress.step / progress.total }
}

/** The picture forming for a job (`formingOf`), if it renders one: not an upscale or 3D. */
export const jobForming = (
  session: Parameters<typeof formingOf>[0],
  job: Job | null | undefined,
) =>
  job && (job.kind === 'render' || job.kind === 'picture')
    ? formingOf(session, job.phase, job.progress)
    : null
