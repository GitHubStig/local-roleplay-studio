import { DOWNLOADING, type Job, type JobKind } from './api'

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
