/**
 * The Roleplay's background work: picturing, rendering and upscaling Frames, queued so the player
 * can ask for several and carry on with the conversation. Each Roleplay runs its jobs one at a
 * time, in order (renders and upscales also share the render queue every Session uses). Jobs don't
 * hold the Roleplay's lock: they save through `updateSession`, onto whatever the conversation has
 * become meanwhile. Jobs live in memory: a server restart forgets the queue.
 */
import { upscaleFrame } from '../frames.ts'
import type { Upscaler } from '../imageModels.ts'
import type { Scenario } from '../scenario.ts'
import type { Session, SessionStore } from '../session.ts'
import {
  pictureFrame,
  renderRoleplayFrame,
  type RoleplayDeps,
  type RoleplayEvent,
} from './engine.ts'
import type { RoleplayModel } from './model.ts'
import type { ArtStyle } from './art.ts'
import type { RoleplaySession } from './types.ts'
import { updateSession } from './update.ts'

export type JobKind = 'picture' | 'render' | 'upscale'
export const JOB_KINDS: readonly JobKind[] = ['picture', 'render', 'upscale']

export interface Job {
  id: string
  kind: JobKind
  frameIndex: number
  /** Failed jobs stay listed, with their error, until dismissed. */
  status: 'queued' | 'running' | 'failed'
  /** While running: writing (text), waiting for another render (queued), or rendering (image). */
  phase?: 'text' | 'queued' | 'image'
  progress?: { step: number; total: number }
  error?: string
  createdAt: string
}

export interface JobContext {
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

export class RoleplayJobs {
  #jobs = new Map<string, Job[]>()
  #running = new Map<string, { job: Job; controller: AbortController }>()
  #ctx: JobContext

  constructor(ctx: JobContext) {
    this.#ctx = ctx
  }

  /** A Roleplay's jobs: running first, then queued in order, then failed. */
  list(sessionId: string): Job[] {
    return (this.#jobs.get(sessionId) ?? []).map((job) => ({ ...job }))
  }

  /**
   * Queues a job. Asking again for work already queued or running on that Frame returns that job
   * instead of queueing it twice.
   */
  enqueue(session: RoleplaySession, kind: JobKind, frameIndex: number): Job {
    const jobs = this.#jobs.get(session.id) ?? []
    const same = jobs.find((j) =>
      j.kind === kind && j.frameIndex === frameIndex && j.status !== 'failed'
    )
    if (same) return { ...same }
    const job: Job = {
      id: crypto.randomUUID().slice(0, 8),
      kind,
      frameIndex,
      status: 'queued',
      createdAt: new Date().toISOString(),
    }
    this.#jobs.set(session.id, [...jobs, job])
    this.#next(session.id)
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
      j.kind === failed.kind && j.frameIndex === failed.frameIndex && j.status !== 'failed'
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

  /** What the running job is doing, for the Roleplay's card on Home; null when idle. */
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
    this.#run(sessionId, job, controller.signal)
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

  async #run(sessionId: string, job: Job, signal: AbortSignal): Promise<void> {
    const session = await this.#ctx.store.load(sessionId)
    if (!session || session.kind !== 'roleplay') throw new Error('This Roleplay no longer exists')
    const emit = (event: RoleplayEvent | { type: string }) => {
      const e = event as RoleplayEvent
      if (e.type === 'phase') job.phase = e.phase
      if (e.type === 'progress') job.progress = { step: e.step, total: e.total }
    }
    const artModel = job.kind === 'picture' ? await this.#ctx.artModel(session) : undefined
    const artStyle = job.kind === 'picture' ? await this.#ctx.artStyle() : undefined
    const withDeps = {
      ...this.#ctx.deps(session),
      ...(artModel ? { artModel } : {}),
      ...(artStyle ? { artStyle } : {}),
    }
    if (job.kind === 'picture') {
      const scenario = await this.#ctx.scenarioFor(session)
      if (scenario instanceof Response) throw new Error((await scenario.json()).error)
      await pictureFrame(withDeps, session, scenario, job.frameIndex, emit, signal)
    } else if (job.kind === 'render') {
      await renderRoleplayFrame(withDeps, session, job.frameIndex, emit, signal)
    } else {
      await upscaleFrame(
        withDeps,
        session,
        job.frameIndex,
        await this.#ctx.upscaler(),
        emit,
        signal,
        (change) => updateSession(withDeps.store, sessionId, (s) => change(s) as RoleplaySession),
      )
    }
  }
}
