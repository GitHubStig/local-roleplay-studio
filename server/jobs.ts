/**
 * A Session's background work (pictures, renders, upscales, voices, 3D), queued so the player can ask
 * for several and carry on: a Roleplay with its conversation, a Chain with its next Frame. Each
 * Session runs its jobs one at a time, in order (renders, upscales and 3D also share the render
 * queue every Session uses). Jobs don't hold the Session's lock: they save through `updateSession`,
 * onto whatever the Session has become meanwhile. Jobs live in memory: a server restart forgets the
 * queue. What a job does is up to its Session's kind (`JobRunner`).
 */
import type { Feature } from './features.ts'
import type { Phase } from './frames.ts'
import { error, json, readJson, type Route } from './http.ts'
import type { Session, SessionStore } from './session.ts'

/**
 * `picture` writes a Roleplay Frame's Image Prompt and `render` renders it; `upscale` takes a
 * picture to 2048 px; `voice` designs a new take of the Character's voice, `speak` voices one
 * Frame's dialogue, and `speak-thought` its thought; `scene` makes a picture into a 2.5D scene
 * (SHARP); `figure` lifts the person in it out as a 3D figure (TripoSplat), and `lito` does so with
 * Apple's LiTo.
 */
export type JobKind =
  | 'picture'
  | 'render'
  | 'upscale'
  | 'voice'
  | 'speak'
  | 'speak-thought'
  | 'scene'
  | 'figure'
  | 'lito'
export const JOB_KINDS: readonly JobKind[] = [
  'picture',
  'render',
  'upscale',
  'voice',
  'speak',
  'speak-thought',
  'scene',
  'figure',
  'lito',
]

/** The Feature each job needs: a job whose Feature is off can't be queued. */
export const JOB_FEATURE: Record<JobKind, Feature> = {
  picture: 'images',
  render: 'images',
  upscale: 'images',
  voice: 'voices',
  speak: 'voices',
  'speak-thought': 'voices',
  scene: 'scenes',
  figure: 'figures',
  lito: 'lito',
}

export interface Job {
  id: string
  kind: JobKind
  frameIndex: number
  /** Failed jobs stay listed, with their error, until dismissed. */
  status: 'queued' | 'running' | 'failed'
  /**
   * While running: writing (text), waiting for another render (queued), rendering (image),
   * speaking (audio), or downloading a model the first time it's used (download).
   */
  phase?: Phase
  progress?: { step: number; total: number }
  error?: string
  createdAt: string
}

/** What a running job reports: its phase, or its progress through the steps. */
export type JobEmit = (
  event: { type: string; phase?: Phase; step?: number; total?: number },
) => void

/** Does `job` for Session `sessionId`, reporting as it goes; throws if it fails. */
export type JobRunner = (
  sessionId: string,
  job: Job,
  emit: JobEmit,
  signal: AbortSignal,
) => Promise<void>

/** Whether `job` is the same work: the same kind, on the same Frame. */
const sameWork = (job: Job, kind: JobKind, frameIndex: number) =>
  job.kind === kind && job.frameIndex === frameIndex

export class SessionJobs {
  #jobs = new Map<string, Job[]>()
  #running = new Map<string, { job: Job; controller: AbortController }>()
  #run: JobRunner

  constructor(run: JobRunner) {
    this.#run = run
  }

  /** A Session's jobs: running first, then queued in order, then failed. */
  list(sessionId: string): Job[] {
    return (this.#jobs.get(sessionId) ?? []).map((job) => ({ ...job }))
  }

  /**
   * Queues a job. Asking again for work already queued or running on that Frame returns that job
   * instead of queueing it twice.
   */
  enqueue(sessionId: string, kind: JobKind, frameIndex: number): Job {
    const jobs = this.#jobs.get(sessionId) ?? []
    const same = jobs.find((j) => sameWork(j, kind, frameIndex) && j.status !== 'failed')
    if (same) return { ...same }
    const job: Job = {
      id: crypto.randomUUID().slice(0, 8),
      kind,
      frameIndex,
      status: 'queued',
      createdAt: new Date().toISOString(),
    }
    this.#jobs.set(sessionId, [...jobs, job])
    this.#next(sessionId)
    return { ...job }
  }

  /**
   * Cancels a queued or running job, or dismisses a failed one. False if there's no such job.
   * Failed jobs are otherwise kept, so they can be retried.
   */
  cancel(sessionId: string, jobId: string): boolean {
    const job = this.#jobs.get(sessionId)?.find((j) => j.id === jobId)
    if (!job) return false
    const running = this.#running.get(sessionId)
    if (running?.job.id === jobId) running.controller.abort(new Error('Cancelled by player'))
    else this.#remove(sessionId, jobId)
    return true
  }

  /**
   * Retries a failed job: back to the end of the queue, its error cleared. If the same work is
   * already queued or running on that Frame, the failed job is just cleared. False if there's no
   * failed job by that id.
   */
  retry(sessionId: string, jobId: string): boolean {
    const jobs = this.#jobs.get(sessionId) ?? []
    const failed = jobs.find((j) => j.id === jobId && j.status === 'failed')
    if (!failed) return false
    const rest = jobs.filter((j) => j.id !== jobId)
    const again = rest.some((j) =>
      sameWork(j, failed.kind, failed.frameIndex) && j.status !== 'failed'
    )
    const { error: _, ...job } = failed
    this.#jobs.set(sessionId, again ? rest : [...rest, { ...job, status: 'queued' }])
    if (!again) this.#next(sessionId)
    return true
  }

  /** Cancels every job on the Frames `which` picks, e.g. an exchange that was undone. */
  cancelWhere(sessionId: string, which: (job: Job) => boolean) {
    for (const job of this.list(sessionId).filter(which)) this.cancel(sessionId, job.id)
  }

  /** What the running job is doing, for the Session's card on Home; null when idle. */
  activity(sessionId: string): Job['phase'] | null {
    return this.#running.get(sessionId)?.job.phase ?? null
  }

  #remove(sessionId: string, jobId: string) {
    const rest = (this.#jobs.get(sessionId) ?? []).filter((j) => j.id !== jobId)
    if (rest.length) this.#jobs.set(sessionId, rest)
    else this.#jobs.delete(sessionId)
  }

  /** Starts the next queued job, unless one is running. */
  #next(sessionId: string) {
    if (this.#running.has(sessionId)) return
    const job = this.#jobs.get(sessionId)?.find((j) => j.status === 'queued')
    if (!job) return
    const controller = new AbortController()
    this.#running.set(sessionId, { job, controller })
    job.status = 'running'
    job.phase = 'text'
    const emit: JobEmit = (event) => {
      if (event.type === 'phase' && event.phase) job.phase = event.phase
      if (event.type === 'progress') job.progress = { step: event.step!, total: event.total! }
    }
    this.#run(sessionId, job, emit, controller.signal)
      .then(
        () => this.#remove(sessionId, job.id),
        (err) => {
          if (controller.signal.aborted) return this.#remove(sessionId, job.id)
          job.status = 'failed'
          job.error = (err as Error).message
          delete job.phase
          delete job.progress
        },
      )
      .finally(() => {
        this.#running.delete(sessionId)
        this.#next(sessionId)
      })
  }
}

export interface JobRoutesContext {
  jobs: SessionJobs
  store: SessionStore
  /**
   * Why `kind` can't be queued on Frame `index` of `session` (a response), or null if it can.
   * `pending`: the jobs already queued or running on that Frame, which may make what it needs.
   */
  check(
    session: Session,
    kind: JobKind,
    index: number,
    pending: readonly JobKind[],
  ): Promise<Response | null>
}

/** The job routes every Session kind shares, under `/api/sessions/:id/jobs`. */
export function jobRoutes(ctx: JobRoutesContext): Route[] {
  const path = (rest = '') => new URLPattern({ pathname: `/api/sessions/:id/jobs${rest}` })
  return [
    ['GET', path(), async (_req, p) => {
      const session = await ctx.store.load(p.id!)
      if (!session) return error('Session not found', 404)
      return json(ctx.jobs.list(session.id))
    }],

    ['POST', path(), async (req, p) => {
      const session = await ctx.store.load(p.id!)
      if (!session) return error('Session not found', 404)
      const body = await readJson(req) as { kind?: unknown; frameIndex?: unknown } | undefined
      const kind = body?.kind as JobKind
      if (!JOB_KINDS.includes(kind)) {
        return error(`kind must be one of: ${JOB_KINDS.join(', ')}`, 400)
      }
      const index = Number(body?.frameIndex)
      if (!Number.isInteger(index) || !session.frames[index]) return error('No such Frame', 404)
      const pending = ctx.jobs.list(session.id)
        .filter((j) => j.frameIndex === index && j.status !== 'failed')
        .map((j) => j.kind)
      const refused = await ctx.check(session, kind, index, pending)
      if (refused) return refused
      ctx.jobs.enqueue(session.id, kind, index)
      return json(ctx.jobs.list(session.id), 201)
    }],

    ['POST', path('/:job/retry'), (_req, p) =>
      Promise.resolve(
        ctx.jobs.retry(p.id!, p.job!)
          ? json(ctx.jobs.list(p.id!))
          : error('No such failed job', 404),
      )],

    ['DELETE', path('/:job'), (_req, p) =>
      Promise.resolve(
        ctx.jobs.cancel(p.id!, p.job!) ? json(ctx.jobs.list(p.id!)) : error('No such job', 404),
      )],
  ]
}
