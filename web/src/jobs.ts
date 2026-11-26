import { DOWNLOADING, type ImageBackend, type Job, type JobKind, previewUrl } from './api'

/** What each job is called, on its Frame and in the queue. */
export const JOB_NAMES: Record<JobKind, string> = {
  look: 'Look',
  sheet: 'Reference sheet',
  picture: 'Picture',
  render: 'Render',
  upscale: 'Upscale',
  voice: 'Voice',
  speak: 'Listen',
  'speak-thought': 'Listen to thought',
  scene: 'SHARP',
  figure: 'TripoSplat',
  lito: 'LiTo',
  style: 'Style scores',
  edit: 'Edit',
  clip: 'Clip',
  direct: 'Music',
  'score-roleplay': 'Score the Roleplay',
  music: 'Music track',
  steer: 'Steer the music',
  export: 'Export',
}

/** Whether a job is still queued or running, rather than failed or done. */
export const isOpen = (job: Pick<Job, 'status'>) =>
  job.status === 'queued' || job.status === 'running'

/**
 * What a job is doing, in a few words. A Roleplay says more about its own work (voices, pictures)
 * through `special`, which answers first when it has something to say.
 */
export function jobStatus(job: Job, special?: (job: Job) => string | undefined): string {
  if (job.status === 'failed') return `Failed: ${job.error}`
  if (job.status === 'done') {
    if (job.export) return `Exported to ${job.export.folder}`
    if (job.faces?.skipped) return 'Faces skipped'
    if (job.faces) return `Done · faces of ${names(job.faces.subjects)}`
    return 'Done'
  }
  if (job.status === 'queued') return 'Queued'
  if (job.faces && job.phase !== 'download') {
    const doing = `Faces · ${names(job.faces.subjects)}…`
    return job.progress ? `${doing} step ${job.progress.step} of ${job.progress.total}` : doing
  }
  if (job.phase === 'download') return DOWNLOADING
  const said = special?.(job)
  if (said) return said
  if (job.phase === 'queued') return 'Waiting for another render…'
  if (job.kind === 'scene') return 'Making the 2.5D scene…'
  if (job.kind === 'figure' || job.kind === 'lito') return 'Making the 3D figure…'
  if (job.kind === 'style' || job.kind === 'export') {
    const doing = job.kind === 'style' ? 'Embedding the pictures…' : 'Writing the pictures…'
    return job.progress ? `${doing} ${job.progress.step} of ${job.progress.total}` : doing
  }
  const doing = job.kind === 'upscale' ? 'Upscaling to 2048 px…' : 'Rendering…'
  return job.progress ? `${doing} step ${job.progress.step} of ${job.progress.total}` : doing
}

const names = (list: string[]) => new Intl.ListFormat('en').format(list)

/** One of a render's two steps in a Session with reference sheets: rendered, then its faces. */
export interface RenderStep {
  text: string
  state: 'done' | 'running' | 'skipped'
  /** What more there is to say of it: why the faces were skipped, whose head wasn't found. */
  note?: string
}

/**
 * A render's two steps, once it has reached its face pass (`Job.faces`): rendered, by its Image
 * Model, then the faces, being repainted, repainted or skipped. None for any other job.
 */
export function renderSteps(job: Job, rendered: string): RenderStep[] {
  const faces = job.faces
  if (job.kind !== 'render' || !faces) return []
  const missed = faces.missed?.length
    ? `${names(faces.missed)}: no head found, left as rendered.`
    : undefined
  return [
    { text: rendered, state: 'done' },
    faces.skipped ? { text: 'Faces skipped', state: 'skipped', note: faces.skipped } : {
      text: `Faces · ${names(faces.subjects)}`,
      state: job.status === 'running' ? 'running' : 'done',
      ...(missed && { note: missed }),
    },
  ]
}

/**
 * How a picture shows work on it (its edge's sweep): waiting for another render,
 * or rendering (and downloading a model first); nothing for other phases.
 */
export function sweepOf(phase: string | null | undefined): 'queued' | 'image' | null {
  if (phase === 'queued') return 'queued'
  return phase === 'image' || phase === 'download' || phase === 'faces' ? 'image' : null
}

/**
 * The picture forming, over a Frame's picture (`SessionPicture`'s `preview`): the latest preview of
 * a render on ComfyUI (`imageBackend`, as the render said when it started; mflux sends none), more
 * opaque as the steps go, since the first ones are dark smudges. Null while it isn't rendering, or before the first
 * step.
 */
export function formingOf(
  session: { id: string } | null | undefined,
  phase: string | null | undefined,
  progress: { step: number; total: number } | null | undefined,
  imageBackend: ImageBackend | undefined,
): { src: string; opacity: number } | null {
  if (!session || imageBackend !== 'comfyui' || phase !== 'image' || !progress) return null
  return { src: previewUrl(session.id, progress.step), opacity: progress.step / progress.total }
}

/** The picture forming for a job (`formingOf`), if it renders one: not an upscale or 3D. */
export const jobForming = (
  session: Parameters<typeof formingOf>[0],
  job: Job | null | undefined,
) =>
  job && (job.kind === 'render' || job.kind === 'picture')
    ? formingOf(session, job.phase, job.progress, job.imageBackend)
    : null

/** The jobs about a Roleplay's music, whose results are on its Music tab. */
const MUSIC_JOBS: readonly JobKind[] = ['direct', 'score-roleplay', 'music', 'steer']

/** Where a job is seen, as its Session's screen shows it (`openJob`). */
export interface JobPlaces {
  /** Its Frame. */
  go: (index: number) => void
  /** An edit: being made, in the viewer. */
  edit: (index: number) => void
  /** A clip: its Frame's Clip section, on the picture it's made from (`Job.image`). */
  clip: (job: Job) => void
  /** The music's work: its Frame, on the Music tab, where a screen has one. */
  music?: (index: number) => void
  /** A reference sheet: the Look it's shown in, where a screen keeps the Look apart from its Frames. */
  look?: () => void
  /** Dismisses it. */
  drop: (job: Job) => void
}

/**
 * Shows a job where it's seen: an edit in the viewer, a clip in its Frame's Clip section, the music's
 * work on the Music tab, a reference sheet on the Look, any other on its Frame; a done one has been seen by then, so it's dismissed.
 */
export function openJob(job: Job, to: JobPlaces) {
  if (job.kind === 'edit') to.edit(job.frameIndex)
  else if (job.kind === 'clip') to.clip(job)
  else if (to.music && MUSIC_JOBS.includes(job.kind)) to.music(job.frameIndex)
  else if (to.look && job.sheet) to.look()
  else to.go(job.frameIndex)
  if (job.status === 'done') to.drop(job)
}

/** A link to a job on its Session's screen, which opens it there (`useJobLink`). */
export const jobLink = (path: string, job: Pick<Job, 'id' | 'frameIndex'>) => ({
  path,
  query: { job: job.id, frame: String(job.frameIndex) },
})
