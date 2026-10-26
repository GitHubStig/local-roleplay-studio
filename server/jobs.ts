/**
 * A Session's background work (pictures, renders, upscales, voices, 3D), queued so the player can ask
 * for several and carry on: a Roleplay with its conversation, a Chain with its next Frame. Each
 * Session runs one job at a time on each machine, in order, so a render on a ComfyUI across the
 * network doesn't hold up a line spoken here; a job also waits for the earlier ones it needs (a
 * render for its picture). Renders, upscales, voices and 3D also share the render queue every
 * Session uses, one per machine. Jobs don't hold the Session's lock: they save through `updateSession`,
 * onto whatever the Session has become meanwhile. Jobs live in memory: a server restart forgets the
 * queue. What a job does is up to its Session's kind (`JobRunner`).
 */
import { join } from '@std/path'
import type { Backend } from './backends.ts'
import type { Feature } from './features.ts'
import type { Phase } from './frames.ts'
import { error, json, readJson, type Route } from './http.ts'
import { EDIT_MODELS, type EditModel, findEditModel } from './images/editModels.ts'
import type { ImageBackendKind } from './images/imageModels.ts'
import { machineOf } from './machine.ts'
import type { Session, SessionStore } from './session.ts'
import type { Settings } from './settings.ts'

/**
 * `picture` writes a Roleplay Frame's Image Prompt and `render` renders it; `upscale` takes a
 * picture to 2048 px; `voice` designs a new take of the Character's voice, `speak` voices one
 * Frame's dialogue, and `speak-thought` its thought; `scene` makes a picture into a 2.5D scene
 * (SHARP); `figure` lifts the person in it out as a 3D figure (TripoSplat), and `lito` does so with
 * Apple's LiTo; `style` embeds the Session's pictures for the Compare dialog's style scores; `edit`
 * repaints a picture as told (ADR 0021).
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
  | 'style'
  | 'edit'
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
  'style',
  'edit',
]

/**
 * The Feature each job needs: a job whose Feature is off can't be queued. Picturing a Frame (its
 * Image Prompt, by the Text Model) needs none, so a Roleplay can be rendered later.
 */
export const JOB_FEATURE: Record<JobKind, Feature | null> = {
  picture: null,
  render: 'images',
  upscale: 'upscale',
  voice: 'voices',
  speak: 'voices',
  'speak-thought': 'voices',
  scene: 'scenes',
  figure: 'figures',
  lito: 'lito',
  style: 'style',
  edit: 'edits',
}

/**
 * What an `edit` is told: what to paint, which model to use, and the area painted over the picture
 * to repaint (a mask file in the Session's folder, saved when the edit is queued; white repainted),
 * or none for the whole picture. A retry makes the newest edit again, as told now, with a new seed,
 * in its place.
 */
export interface EditOrder {
  instruction: string
  model?: EditModel
  mask?: string
  retry?: boolean
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
  /** The machine it runs on (`machineKey`): jobs on different machines run side by side. */
  machine: string
  /**
   * A render's Image Model, as its Session had it when queued: the render uses it whatever the
   * Session switches to meanwhile, so it runs where it was queued to (`machine`).
   */
  image?: ImageChoice
  /**
   * The kind of backend its render runs on, once it starts: for the page, "by Krea 2 · mflux", and
   * whether there's a picture forming to show (ComfyUI's previews).
   */
  imageBackend?: ImageBackendKind
  /** An edit's order. Its painted area is left out of the list the page is sent (`list`). */
  edit?: EditOrder
}

/** The Session settings that say which Image Model renders. */
export type ImageChoice = Pick<Settings, 'imageModel' | 'steps'>

/** The Image Model a render of `session` queued now keeps (`Job.image`). */
export const imageChoiceOf = ({ settings }: Session): ImageChoice => ({
  imageModel: settings.imageModel,
  steps: settings.steps,
})

/** `session` as `job` renders it: with the Image Model it was queued with, if it's a render. */
export const asQueued = <S extends Session>(session: S, job: Job): S =>
  job.image
    ? {
      ...session,
      settings: { ...session.settings, imageModel: job.image.imageModel, steps: job.image.steps },
    }
    : session

/** What a running job reports: its phase, or its progress through the steps. */
export type JobEmit = (
  event: {
    type: string
    phase?: Phase
    step?: number
    total?: number
    imageBackend?: ImageBackendKind
  },
) => void

/** Does `job` for Session `sessionId`, reporting as it goes; throws if it fails. */
export type JobRunner = (
  sessionId: string,
  job: Job,
  emit: JobEmit,
  signal: AbortSignal,
) => Promise<void>

/** Jobs that make or use a picture with an image model, which unload the Text Model first. */
const IMAGE_JOBS: readonly JobKind[] = ['render', 'upscale', 'scene', 'figure', 'lito', 'edit']

/**
 * What each job waits for, when queued earlier on its Frame (or, for the Session's own jobs, on any
 * Frame): a render for its Image Prompt, an upscale for its render, 3D for its upscale, a spoken
 * line for its voice, the style scores for every picture; an edit for the render or edit it's made
 * from, and what's made from a picture for its edits. Jobs on one machine also keep their order.
 */
const NEEDS: Record<JobKind, readonly JobKind[]> = {
  picture: [],
  render: ['picture'],
  upscale: ['picture', 'render', 'edit'],
  voice: [],
  speak: ['voice'],
  'speak-thought': ['voice'],
  scene: ['picture', 'render', 'edit', 'upscale'],
  figure: ['picture', 'render', 'edit', 'upscale'],
  lito: ['picture', 'render', 'edit', 'upscale'],
  style: ['picture', 'render', 'edit'],
  edit: ['picture', 'render', 'edit'],
}

/**
 * Whether `job` is the same work: the same kind, on the same Frame, by the same Image Model (by
 * name, whichever backend: a Frame keeps one picture per model, `shownPicture`). Edits never are:
 * each is made from the one before.
 */
const sameWork = (job: Job, kind: JobKind, frameIndex: number, image?: ImageChoice) =>
  kind !== 'edit' && job.kind === kind && job.frameIndex === frameIndex &&
  job.image?.imageModel === image?.imageModel

interface Running {
  job: Job
  controller: AbortController
  /** When it's ended (never rejected). */
  done: Promise<void>
}

export class SessionJobs {
  #jobs = new Map<string, Job[]>()
  /** Each Session's running jobs, at most one per machine, by id. */
  #running = new Map<string, Map<string, Running>>()
  #run: JobRunner
  #dropped?: (sessionId: string, job: Job) => void
  /** Sessions whose queue is held: no job starts until `holding` ends. */
  #held = new Set<string>()

  /**
   * `dropped` hears of each job that ends without being done: cancelled, or dismissed after it
   * failed (e.g. to delete an edit's painted area, which only it used).
   */
  constructor(run: JobRunner, dropped?: (sessionId: string, job: Job) => void) {
    this.#run = run
    this.#dropped = dropped
  }

  /** A Session's jobs, in the order they were queued. */
  list(sessionId: string): Job[] {
    return (this.#jobs.get(sessionId) ?? []).map((job) => ({ ...job }))
  }

  /**
   * Queues a job. Asking again for work already queued or running on that Frame returns that job
   * instead of queueing it twice; a render by another Image Model is other work. A picture (a
   * Roleplay Frame's Image Prompt) goes ahead of queued image jobs: a new Reply's is written while
   * its Text Model is still loaded, not after a batch of renders that each unload it. `machine` is
   * where it runs (`machineKey`), `image` a render's Image Model (`Job.image`), and `edit` an
   * edit's order.
   */
  enqueue(
    sessionId: string,
    kind: JobKind,
    frameIndex: number,
    machine = 'here',
    image?: ImageChoice,
    edit?: EditOrder,
  ): Job {
    const jobs = this.#jobs.get(sessionId) ?? []
    const same = jobs.find((j) => sameWork(j, kind, frameIndex, image) && j.status !== 'failed')
    if (same) return { ...same }
    const job: Job = {
      id: crypto.randomUUID().slice(0, 8),
      kind,
      frameIndex,
      status: 'queued',
      createdAt: new Date().toISOString(),
      machine,
      ...(image && { image }),
      ...(edit && { edit }),
    }
    const ahead = kind === 'picture'
      ? jobs.findIndex((j) => j.status === 'queued' && IMAGE_JOBS.includes(j.kind))
      : -1
    this.#jobs.set(
      sessionId,
      ahead < 0 ? [...jobs, job] : [...jobs.slice(0, ahead), job, ...jobs.slice(ahead)],
    )
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
    const running = this.#running.get(sessionId)?.get(jobId)
    if (running) running.controller.abort(new Error('Cancelled by player'))
    else {
      this.#remove(sessionId, jobId)
      this.#dropped?.(sessionId, job)
    }
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
      sameWork(j, failed.kind, failed.frameIndex, failed.image) && j.status !== 'failed'
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

  /**
   * Does `work` with the Session's queue held, so no queued job starts meanwhile (a running one
   * carries on), then lets the next one start.
   */
  async holding<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
    this.#held.add(sessionId)
    try {
      return await work()
    } finally {
      this.#held.delete(sessionId)
      this.#next(sessionId)
    }
  }

  /**
   * Does `work` between two renders: once the renders running on the Session, if any, have ended,
   * with the queue held so the next doesn't start first. A change to the Image Prompts (the Look)
   * then reaches every render still queued; one that was running is stale by it.
   */
  betweenRenders<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
    return this.holding(sessionId, async () => {
      const running = [...this.#running.get(sessionId)?.values() ?? []]
      await Promise.all(running.filter((r) => r.job.kind === 'render').map((r) => r.done))
      return await work()
    })
  }

  /**
   * Frame `index` was deleted and the Frames after it numbered down one: its own queued and failed
   * jobs go, and the later Frames' follow them, running ones too (they save onto their Frame where
   * it is then). None may be running on it.
   */
  frameDeleted(sessionId: string, index: number) {
    const jobs = (this.#jobs.get(sessionId) ?? []).filter((j) => j.frameIndex !== index)
    for (const job of jobs) if (job.frameIndex > index) job.frameIndex--
    if (jobs.length) this.#jobs.set(sessionId, jobs)
    else this.#jobs.delete(sessionId)
  }

  /**
   * What a running job is doing, for the Session's card on Home (the first queued, of several);
   * null when idle.
   */
  activity(sessionId: string): Job['phase'] | null {
    return this.#jobs.get(sessionId)?.find((j) => j.status === 'running')?.phase ?? null
  }

  #remove(sessionId: string, jobId: string) {
    const rest = (this.#jobs.get(sessionId) ?? []).filter((j) => j.id !== jobId)
    if (rest.length) this.#jobs.set(sessionId, rest)
    else this.#jobs.delete(sessionId)
  }

  /**
   * Starts every queued job that can: unless the queue is held, each with no job running on its
   * machine or queued ahead of it there, and none queued ahead that it needs (`NEEDS`). (A picture
   * goes ahead of queued jobs, so a job running on its machine may be behind it.)
   */
  #next(sessionId: string) {
    if (this.#held.has(sessionId)) return
    const jobs = this.#jobs.get(sessionId) ?? []
    for (const [i, job] of jobs.entries()) {
      if (job.status !== 'queued') continue
      if (jobs.some((j) => j.status === 'running' && j.machine === job.machine)) continue
      const ahead = jobs.slice(0, i).filter((j) => j.status !== 'failed')
      const waits = ahead.some((j) =>
        j.machine === job.machine ||
        (NEEDS[job.kind].includes(j.kind) &&
          (j.frameIndex === job.frameIndex || SESSION_JOBS.includes(j.kind) ||
            SESSION_JOBS.includes(job.kind)))
      )
      if (!waits) this.#start(sessionId, job)
    }
  }

  #start(sessionId: string, job: Job) {
    const controller = new AbortController()
    const { promise: done, resolve: ended } = Promise.withResolvers<void>()
    const running = this.#running.get(sessionId) ?? new Map<string, Running>()
    this.#running.set(sessionId, running.set(job.id, { job, controller, done }))
    job.status = 'running'
    job.phase = 'text'
    const emit: JobEmit = (event) => {
      if (event.type === 'phase' && event.phase) job.phase = event.phase
      if (event.imageBackend) job.imageBackend = event.imageBackend
      if (event.type === 'progress') job.progress = { step: event.step!, total: event.total! }
    }
    this.#run(sessionId, job, emit, controller.signal)
      .then(
        () => this.#remove(sessionId, job.id),
        (err) => {
          if (controller.signal.aborted) {
            this.#remove(sessionId, job.id)
            return this.#dropped?.(sessionId, job)
          }
          job.status = 'failed'
          job.error = (err as Error).message
          delete job.phase
          delete job.progress
        },
      )
      .finally(() => {
        running.delete(job.id)
        if (!running.size) this.#running.delete(sessionId)
        ended()
        this.#next(sessionId)
      })
  }
}

export interface JobRoutesContext {
  jobs: SessionJobs
  store: SessionStore
  /**
   * Why `kind` can't be queued on Frame `index` of `session` (a response), or null if it can.
   * `pending`: the jobs already queued or running on that Frame, which may make what it needs;
   * `edit`: an edit's order.
   */
  check(
    session: Session,
    kind: JobKind,
    index: number,
    pending: readonly JobKind[],
    edit?: EditOrder,
  ): Promise<Response | null>
  /**
   * Which Backend `kind` would go to for `session` now, as an edit is told (`jobBackend`), and so
   * which machine it takes turns on; left out, all run here.
   */
  backendOf?(session: Session, kind: JobKind, edit?: EditOrder): Promise<Backend | undefined>
}

/**
 * Jobs about the Session rather than one Frame (a Roleplay's voice, the style scores' embeddings):
 * queued as Frame 0's, which needn't exist yet, as a voice can be designed while the Cast is
 * reviewed, before the scene begins. Their calls are logged with the setup's, not Frame 0's.
 */
export const SESSION_JOBS: readonly JobKind[] = ['voice', 'style']

/** The longest instruction an edit takes, and the largest painted area (base64, ~6 MB). */
const MAX_INSTRUCTION = 1000
const MAX_MASK = 8_000_000

/**
 * An edit's order from a request, its painted area still the PNG it was sent as (base64), or why
 * it isn't one.
 */
export function editOrder(body: unknown): EditOrder | string {
  const b = body as {
    instruction?: unknown
    model?: unknown
    mask?: unknown
    retry?: unknown
  } | undefined
  const retry = b?.retry === true ? { retry: true } : {}
  const instruction = typeof b?.instruction === 'string' ? b.instruction.trim() : ''
  if (!instruction) return 'Say what to paint'
  if (instruction.length > MAX_INSTRUCTION) {
    return `An instruction can be at most ${MAX_INSTRUCTION} characters`
  }
  const model = findEditModel(b?.model)?.id
  if (b?.model !== undefined && !model) {
    return `model must be one of: ${EDIT_MODELS.map((m) => m.id).join(', ')}`
  }
  const selectedModel = model ? { model } : {}
  if (b?.mask === undefined) return { instruction, ...selectedModel, ...retry }
  if (
    typeof b.mask !== 'string' || b.mask.length > MAX_MASK || !/^[A-Za-z0-9+/]+=*$/.test(b.mask)
  ) {
    return 'mask must be a PNG, in base64'
  }
  return { instruction, ...selectedModel, mask: b.mask, ...retry }
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
      const body = await readJson(req) as
        | { kind?: unknown; frameIndex?: unknown; edit?: unknown }
        | undefined
      const kind = body?.kind as JobKind
      if (!JOB_KINDS.includes(kind)) {
        return error(`kind must be one of: ${JOB_KINDS.join(', ')}`, 400)
      }
      const edit = kind === 'edit' ? editOrder(body?.edit) : undefined
      if (typeof edit === 'string') return error(edit, 400)
      const index = Number(body?.frameIndex)
      const ofSession = SESSION_JOBS.includes(kind) && index === 0
      if (!Number.isInteger(index) || (!session.frames[index] && !ofSession)) {
        return error('No such Frame', 404)
      }
      const pending = ctx.jobs.list(session.id)
        .filter((j) => j.frameIndex === index && j.status !== 'failed')
        .map((j) => j.kind)
      const refused = await ctx.check(session, kind, index, pending, edit)
      if (refused) return refused
      // The painted area is saved as it's queued, so the page can show it while the edit waits.
      if (edit?.mask) {
        const file = `mask-${index}-${crypto.randomUUID().slice(0, 8)}.png`
        const png = Uint8Array.from(atob(edit.mask), (c) => c.charCodeAt(0))
        await Deno.writeFile(join(ctx.store.dir(session.id), file), png)
        edit.mask = file
      }
      const backend = await ctx.backendOf?.(session, kind, edit)
      ctx.jobs.enqueue(
        session.id,
        kind,
        index,
        ctx.backendOf ? machineOf(backend) : undefined,
        kind === 'render' ? imageChoiceOf(session) : undefined,
        edit,
      )
      return json(ctx.jobs.list(session.id), 201)
    }],

    ['POST', path('/:job/retry'), (_req, p) =>
      Promise.resolve(
        ctx.jobs.retry(p.id!, p.job!)
          ? json(ctx.jobs.list(p.id!))
          : error('No such failed job', 404),
      )],

    // Clears the queue: cancels what's running and queued, and dismisses what failed.
    ['DELETE', path(), (_req, p) => {
      ctx.jobs.cancelWhere(p.id!, () => true)
      return Promise.resolve(json(ctx.jobs.list(p.id!)))
    }],

    ['DELETE', path('/:job'), (_req, p) =>
      Promise.resolve(
        ctx.jobs.cancel(p.id!, p.job!) ? json(ctx.jobs.list(p.id!)) : error('No such job', 404),
      )],
  ]
}
