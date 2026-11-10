import { Refusal } from './refusal.ts'
import { error, isJson, json, type Route } from './http.ts'
import type { ImageGenerator } from './images/imageGenerator.ts'
import { IMAGE_BACKENDS, type ImageBackendKind } from './images/imageModels.ts'
import type { ComfyStatus } from './comfyui/status.ts'
import type { ComfyUses } from '../shared/comfyui.ts'
import { setLimitsEnabled } from './limits.ts'
import { type Backend, BACKEND_NAMES } from '../shared/backends.ts'
import type { TextChoice, TextModelInfo } from './text/backend.ts'
import type { ScenarioFolder, ScenarioLibrary } from './scenario.ts'
import type { Session, SessionStore } from './session.ts'
import type { SettingsStore } from './settings.ts'
import type { TextModel } from './textModel.ts'
import type { RoleplayModel } from './roleplay/model.ts'
import type { FigureMaker } from './3d/figure.ts'
import type { VideoGenerator } from './video/videoGenerator.ts'
import { clipRefusal } from './video/makeClip.ts'
import type { SceneMaker } from './3d/scene.ts'
import type { StyleEmbedder } from './style/embedder.ts'
import { embedStyles } from './style/job.ts'
import { checkEdit, editFrame } from './pictureEdits.ts'
import { findEditModel } from './images/editModels.ts'
import type { VoiceEngine } from './voice/voice.ts'
import { roleplayRoutes } from './roleplay/routes.ts'
import { spokenText } from './roleplay/voice.ts'
import { clipRoutes } from './video/routes.ts'
import { type SessionsFolder, sessionsFolderRoutes } from './sessionsFolder.ts'
import { checkRoleplayJob, type RoleplayJobContext, runRoleplayJob } from './roleplay/jobs.ts'
import { cuesWaiting } from './roleplay/music/tracks.ts'
import type { MusicGenerator } from './music/musicGenerator.ts'
import {
  asQueued,
  type EditOrder,
  imageChoiceOf,
  isOpen,
  type Job,
  type JobEmit,
  jobRoutes,
  type QueueStore,
  SessionJobs,
  textChoiceOf,
} from './jobs.ts'
import { JOB_FEATURE, SESSION_JOBS } from './jobKinds.ts'
import type { JobKind } from '../shared/jobKinds.ts'
import { logCalls } from './calls.ts'
import { FEATURE_NAMES, withBackends } from './features.ts'
import type { Availabilities, Availability, Feature } from '../shared/features.ts'
import { checkChainJob, runChainJob } from './chain/jobs.ts'
import { checkStoryboardJob, runStoryboardJob } from './storyboard/jobs.ts'
import { GoneError, removeSession, updateSession } from './update.ts'
import type { ExportPage } from './export/comparison.ts'
import { removeFiles } from './pictures.ts'
import {
  backendOf,
  editJob,
  type HeavyJob,
  jobBackend,
  machineOf,
  textBackendFor,
} from './machine.ts'
import { Previews } from './previews.ts'
import { RenderQueue } from './renderQueue.ts'
import { reportingTurns } from './text/turns.ts'
import { notingTraces } from './comfyui/traces.ts'
import { clearTraces } from './comfyui/files.ts'
import { type FrameDeps, frameName, type Phase } from './frames.ts'

import { type AppContext, scenarioFor, titleOf } from './appContext.ts'
import { settingsRoutes } from './settingsRoutes.ts'
import { scenarioRoutes } from './scenario/routes.ts'
import { sessionRoutes } from './sessionRoutes.ts'
import { pictureRoutes } from './pictureRoutes.ts'
import { chainRoutes } from './chain/routes.ts'
import { storyboardRoutes } from './storyboard/routes.ts'

export interface AppDeps {
  settings: SettingsStore
  /** A text Backend's models; `apiKey` stands in for its saved one (trying a new key). */
  listTextModels: (backend: Backend, apiKey?: string) => Promise<TextModelInfo[]>
  /**
   * The Backend Settings send a Text Model to now (`textBackendFor`). Left out, Settings' preferred
   * text Backend.
   */
  textBackendOf?: (model: string) => Promise<Backend | undefined>
  /** Whether ComfyUI answers at an address, and can run what Settings send it (for Settings). */
  comfyuiStatus?: (baseUrl: string, uses: ComfyUses) => Promise<ComfyStatus>
  scenarios: ScenarioLibrary
  /** The player's own Scenarios (`scenarios/`), which the page saves to; left out, it can't. */
  ownScenarios?: ScenarioFolder
  sessions: SessionStore
  /** Where the Sessions are, which the player can move; left out, they can't. */
  sessionsFolder?: SessionsFolder
  /** Asks the player for a folder with the machine's dialog; left out, they type the path. */
  pickFolder?: () => Promise<string | null>
  /** The Text Model as a Chain or Storyboard uses it. */
  textModel: (choice: TextChoice) => TextModel
  imageGenerator: ImageGenerator
  /** The Text Model as a Roleplay uses it. */
  roleplayModel: (choice: TextChoice) => RoleplayModel
  /** Speaks Roleplay Characters' lines; without it, voices are unavailable. */
  voice?: VoiceEngine
  /** Makes Roleplay pictures into 3D scenes; without it, they stay flat. */
  scene?: SceneMaker
  /** Makes Roleplay people into 3D figures; without it, there are none. */
  figure?: FigureMaker
  /** The same with Apple's LiTo. */
  lito?: FigureMaker
  /** Clips from a Frame's pictures (LTX 2.5 on a ComfyUI), when set up. */
  video?: VideoGenerator
  /** The music model on a ComfyUI, when music is set up. */
  music?: MusicGenerator
  /** Embeds pictures for the Compare dialog's style scores; without it, there are none. */
  style?: StyleEmbedder
  /**
   * Which extras this machine can run (`detectFeatures`, at startup). Left out, those whose
   * backend is given are available, the rest not: what tests want.
   */
  features?: Availabilities
  /**
   * Where the Compare dialog's exports go (a folder per Session), and the page they're written
   * into (`buildComparisonPage`); without it, there's no export.
   */
  exports?: { dir: string; page: () => Promise<ExportPage> }
  /**
   * Where heavy jobs, and the Text Model's calls, take turns on each machine (`RenderQueue`), which
   * frees memory before each heavy job. Left out, one that runs every job here and frees nothing.
   */
  renderQueue?: RenderQueue
  /** Keeps the queue between runs of the server (`fileQueueStore`); left out, a restart forgets it. */
  queue?: QueueStore
  newSessionId?: () => string
  randomSeed?: () => number
}

function defaultSessionId(): string {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  return `${stamp.slice(0, 8)}-${stamp.slice(8)}-${crypto.randomUUID().slice(0, 4)}`
}

const defaultSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]

/** One server-sent event of a work stream: its `type`, plus whatever that event carries. */
export type StreamEvent = { type: string; phase?: Phase; [field: string]: unknown }
export type LockKind =
  | 'frame'
  | 'undo'
  | 'delete'
  | 'delete-frame'
  | 'plan'
  | 'write'
  | 'render'
  | 'edit'
  | 'upscale'
  | 'setup'
  | 'suggest'
  | 'copy'
  | 'clip-prompt'
  | 'score'

export function createHandler(deps: AppDeps): (req: Request) => Promise<Response> {
  const newSessionId = deps.newSessionId ?? defaultSessionId
  const randomSeed = deps.randomSeed ?? defaultSeed
  /**
   * The work in progress per Session (at most one each): the step it has reached, and which Frame
   * it is on for Storyboard work.
   */
  const active = new Map<
    string,
    { controller: AbortController; phase: Phase; frameIndex: number | null }
  >()
  /** One heavy job at a time on each machine, across all Sessions. */
  const renderQueue = deps.renderQueue ?? new RenderQueue()
  /** The picture forming: each render's latest preview, while it renders. */
  const previews = new Previews()

  /**
   * What each Session is busy with. Every change to a Session takes this lock *before* reading the
   * Session, so no request ever acts on a copy another request is about to change.
   */
  const locks = new Map<string, LockKind>()
  const BUSY_MESSAGES: Record<LockKind, string> = {
    frame: 'A Frame is already in progress',
    undo: 'An Undo is in progress',
    delete: 'This Session is being deleted',
    'delete-frame': 'A Frame is being deleted',
    plan: 'The Storyboard is being planned',
    write: "The Storyboard's Frames are being written",
    render: 'A Frame is rendering',
    edit: 'A Frame is being edited',
    upscale: 'A Frame is being upscaled',
    setup: 'The Roleplay is being set up',
    suggest: 'A message is being suggested',
    copy: 'This Storyboard is being made into a Chain',
    'clip-prompt': "A clip's prompt is being written",
    score: 'The Score is being written',
  }

  /** Takes the Session's lock, or returns a 409 saying what holds it. */
  function lock(id: string, what: LockKind): Response | null {
    const holder = locks.get(id)
    if (holder) return error(BUSY_MESSAGES[holder], 409)
    locks.set(id, what)
    return null
  }
  const unlock = (id: string) => locks.delete(id)

  async function loadSession(id: string): Promise<Session> {
    const session = await deps.sessions.load(id)
    if (!session) throw new Refusal('Session not found', 404)
    return session
  }

  /**
   * A Session's Text Model (or another), with its Thinking unless given, and seeded from its seed.
   */
  const textChoice = (
    session: Session,
    model = session.settings.textModel,
    thinking = session.settings.thinking,
  ): TextChoice => ({
    model,
    thinking,
    seeding: { session: session.id, seed: session.seed },
  })

  /** The Backend a heavy job goes to as Settings are now (`backendOf`). */
  const heavyBackend = async (job: HeavyJob) => backendOf(job, await deps.settings.load(), detected)

  const frameDeps = (session: Session): FrameDeps => ({
    store: deps.sessions,
    textModel: deps.textModel(textChoice(session)),
    imageGenerator: deps.imageGenerator,
    renderQueue,
    previews,
    settings: () => deps.settings.load(),
    backendOf: heavyBackend,
  })

  /**
   * Runs a piece of work as a server-sent event stream. The caller holds the Session's lock; the
   * stream releases it when the work ends. Dropping the connection cancels the work.
   * `discardOnFailure` removes the Session if the work fails (an Opening Frame, or a plan).
   */
  function stream(
    session: Session,
    frameIndex: number | null,
    discardOnFailure: boolean,
    run: (send: (event: StreamEvent) => void, signal: AbortSignal) => Promise<void>,
  ): Response {
    const controller = new AbortController()
    const work = { controller, phase: 'text' as Phase, frameIndex }
    active.set(session.id, work)
    const encoder = new TextEncoder()

    const body = new ReadableStream<Uint8Array>({
      async start(sink) {
        const send = (event: StreamEvent) => {
          if (event.type === 'phase' && event.phase) work.phase = event.phase
          try {
            sink.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`))
          } catch {
            // Client already gone; the work is being aborted.
          }
        }
        try {
          const { callLog } = await deps.settings.load()
          await logCalls(
            callLog,
            deps.sessions.dir(session.id),
            frameIndex,
            () =>
              reportingTurns(
                (phase) => send({ type: 'phase', phase }),
                () => run(send, controller.signal),
              ),
          )
        } catch (err) {
          if (discardOnFailure) await removeSession(deps.sessions, session.id)
          const sessionDiscarded = discardOnFailure
          if (controller.signal.aborted) send({ type: 'cancelled', sessionDiscarded })
          else send({ type: 'failed', message: (err as Error).message, sessionDiscarded })
        } finally {
          active.delete(session.id)
          unlock(session.id)
          try {
            sink.close()
          } catch {
            // Already closed by a disconnect.
          }
        }
      },
      cancel() {
        controller.abort(new Error('Client disconnected'))
      },
    })
    return new Response(body, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  /**
   * Takes the Session's lock, loads it, and runs `handle`; the lock is released when `handle`
   * returns, unless it returned a stream, which releases it when the stream ends.
   */
  async function locked(
    id: string,
    kind: LockKind,
    handle: (session: Session) => Response | Promise<Response>,
  ): Promise<Response> {
    const busy = lock(id, kind)
    if (busy) return busy
    let streaming = false
    try {
      const session = await loadSession(id)
      const res = await handle(session)
      streaming = res.headers.get('Content-Type') === 'text/event-stream'
      return res
    } finally {
      if (!streaming) unlock(id)
    }
  }

  const roleplayDeps = (session: Session) => ({
    store: deps.sessions,
    imageGenerator: deps.imageGenerator,
    renderQueue,
    previews,
    settings: () => deps.settings.load(),
    backendOf: heavyBackend,
    roleplayModel: deps.roleplayModel(textChoice(session)),
    voice: deps.voice,
    scene: deps.scene,
    figure: deps.figure,
    lito: deps.lito,
    video: deps.video,
  })
  const given = (backend: unknown, what: string): Availability =>
    backend ? { available: true } : { available: false, reason: `No ${what} was set up` }
  const detected: Availabilities = deps.features ?? {
    images: { available: true },
    upscale: { available: true },
    edits: { available: true },
    voices: given(deps.voice, 'voice service'),
    scenes: given(deps.scene, 'SHARP'),
    figures: given(deps.figure, 'TripoSplat'),
    lito: given(deps.lito, 'LiTo'),
    style: given(deps.style, 'style embedder'),
    video: given(deps.video, 'video generator'),
  }
  /**
   * The kinds of Image backend whose models a Session can switch to: mflux where it's installed,
   * ComfyUI where Settings list one (whether it answers is found at the render).
   */
  const imageBackends = async (): Promise<ImageBackendKind[]> => {
    const { backends } = await deps.settings.load()
    return IMAGE_BACKENDS.filter((kind) =>
      kind === 'mflux' ? detected.images.available : backends.some((b) => b.kind === kind)
    )
  }
  /** What can run now, with Settings' backends (`withBackends`). */
  const availability = async (): Promise<Availabilities> =>
    withBackends(detected, await deps.settings.load())

  /**
   * Why `feature` can't be used now (a 409 to send back), or null if it can: this machine can't
   * run it, or it's switched off in Settings.
   */
  async function featureOff(feature: Feature): Promise<Response | null> {
    const { available, reason } = (await availability())[feature]
    if (!available) return error(`${FEATURE_NAMES[feature]} isn't available here: ${reason}`, 409)
    if (!(await deps.settings.load()).features[feature]) {
      return error(`${FEATURE_NAMES[feature]} is switched off in Settings`, 409)
    }
    return null
  }

  /** The upscaler chosen in Settings now: it doesn't change the Frames, so it applies at once. */
  const upscaler = async () => (await deps.settings.load()).upscaler
  /** The video model chosen in Settings now, read as each clip starts. */
  const videoModel = async () => (await deps.settings.load()).videoModel
  /** Its clip size chosen in Settings now, read as each clip starts. */
  const videoSize = async (model: string) => (await deps.settings.load()).videoSizes?.[model]
  const roleplayJobs: RoleplayJobContext = {
    store: deps.sessions,
    deps: roleplayDeps,
    scenarioFor,
    upscaler,
    videoModel,
    videoSize,
    music: deps.music,
  }
  /** Which Backend a job of `kind` would go to for `session` now, as an edit is told. */
  async function jobBackendOf(session: Session, kind: JobKind, edit?: EditOrder) {
    const now = await deps.settings.load()
    // A picture and the music are directed by the Session's Text Model, where it runs.
    const text = kind === 'picture' || kind === 'direct' || kind === 'score-roleplay' ||
        kind === 'steer'
      ? await textBackendOf(session.settings.textModel)
      : undefined
    return jobBackend(kind, session.settings, now, detected, {
      editModel: edit?.model,
      editBackend: edit?.backend,
      text,
    })
  }

  /** Queues the music of a Roleplay's Cues that have none yet, if a Backend can make it. */
  async function queueMusic(id: string, also?: number) {
    const session = await deps.sessions.load(id)
    if (session?.kind !== 'roleplay' || !deps.music || !(await deps.settings.load()).music) return
    const backend = await jobBackendOf(session, 'music')
    if (!backend) return
    for (const index of new Set([...cuesWaiting(session), ...(also === undefined ? [] : [also])])) {
      jobs.enqueue(id, 'music', index, machineOf(backend))
    }
  }

  /** Every Session's background work, run as its kind says: a Roleplay's or a Chain's. */
  const jobs: SessionJobs = new SessionJobs(
    async (id, job, emit, signal) => {
      const { callLog } = await deps.settings.load()
      return logCalls(
        callLog,
        deps.sessions.dir(id),
        // A voice or the style scores belong to the Session, not the Frame 0 they're queued as.
        SESSION_JOBS.includes(job.kind) ? null : job.frameIndex,
        () =>
          reportingTurns(
            (phase) => emit({ type: 'phase', phase }),
            () =>
              notingTraces(
                (comfy) => emit({ type: 'comfy', comfy }),
                () => runJob(id, job, emit, signal),
              ),
          ),
      )
    },
    // An edit cancelled or dismissed: the area painted for it, saved as it was queued, goes too.
    // A clip cut off by a restart, cancelled before it picked up its result: what it left on
    // ComfyUI is cleaned up.
    async (id, job) => {
      if (job.edit?.mask) await removeFiles(deps.sessions.dir(id), [job.edit.mask])
      if (job.resume && !job.startedAt) {
        await clearTraces(job.resume).catch((err) =>
          console.warn(`Couldn't clean up after a clip on ComfyUI: ${err.message}`)
        )
      }
    },
    deps.queue,
  )
  // The queue as it was when the server last stopped, once what was cut off is cleaned up.
  jobs.restore(async (id) => !!(await deps.sessions.load(id)), (traces) => clearTraces(traces))

  async function runJob(id: string, queued: Job, emit: JobEmit, signal: AbortSignal) {
    // The job as it was when the Session loaded, its Frame's index matching that Session's.
    const [loaded, job] = await jobs.frames(
      id,
      async () => [await deps.sessions.load(id), { ...queued }] as const,
    )
    const session = loaded && asQueued(loaded, job)
    if (session && job.kind === 'style') {
      return embedStyles(
        { store: deps.sessions, style: deps.style, renderQueue },
        session,
        emit,
        signal,
      )
    }
    // The same in every kind of Session (ADR 0021).
    if (session && job.kind === 'edit') {
      const save = (change: (s: Session) => Session) =>
        updateSession(deps.sessions, session.id, session.kind, change)
      await editFrame(
        {
          store: deps.sessions,
          imageGenerator: deps.imageGenerator,
          renderQueue,
          backendOf: heavyBackend,
          settings: () => deps.settings.load(),
        },
        session,
        job.frameIndex,
        job.edit!,
        job.edit!.model ?? (await deps.settings.load()).editModel,
        emit,
        signal,
        save,
      )
      return
    }
    if (session?.kind === 'roleplay') {
      await runRoleplayJob(roleplayJobs, session, job, emit, signal)
      // The Cues just written get their music, behind what's already queued.
      if (job.kind === 'direct' || job.kind === 'score-roleplay') await queueMusic(id)
      // A steered Cue has a track, which plays on until its new one is made.
      if (job.kind === 'steer') await queueMusic(id, job.frameIndex)
      return
    }
    if (session?.kind === 'chain' || session?.kind === 'storyboard') {
      const pictureDeps = {
        ...frameDeps(session),
        scene: deps.scene,
        figure: deps.figure,
        lito: deps.lito,
        video: deps.video,
        upscaler,
        videoModel,
        videoSize,
      }
      return session.kind === 'chain'
        ? runChainJob(pictureDeps, session, job, emit, signal)
        : runStoryboardJob(pictureDeps, session, job, emit, signal)
    }
    throw new GoneError('This Session no longer exists')
  }

  /** The Backend Settings send a Text Model to now; their preferred text Backend, if not told. */
  const textBackendOf = async (model: string) =>
    deps.textBackendOf
      ? deps.textBackendOf(model)
      : textBackendFor(await deps.settings.load(), model, () => Promise.resolve([]))

  /** What each part's routes are lent (`appContext.ts`). */
  const ctx: AppContext = {
    deps,
    jobs,
    active,
    previews,
    renderQueue,
    detected,
    newSessionId,
    randomSeed,
    locked,
    stream,
    loadSession,
    frameDeps,
    featureOff,
    availability,
    imageBackends,
    heavyBackend,
    jobBackendOf,
  }

  const routes: Route[] = [
    ...(deps.sessionsFolder
      ? sessionsFolderRoutes({
        folder: deps.sessionsFolder,
        pick: deps.pickFolder,
        keep: async (path) =>
          deps.settings.save({ ...await deps.settings.load(), sessionsFolder: path }),
        busy: async () =>
          active.size > 0 ||
          (await deps.sessions.list()).some((s) => jobs.list(s.id).some(isOpen)),
      })
      : []),
    ...clipRoutes({
      locked,
      stream,
      // Thinking off, as for Suggest: the prompt is a draft for the player to edit.
      textModel: (session) => deps.textModel(textChoice(session, undefined, false)),
    }),
    ...roleplayRoutes({
      locked,
      stream,
      scenarioFor,
      deps: roleplayDeps,
      // Thinking off, as for pictures: a suggestion is a draft, and it should come quickly.
      suggestModel: (session) => deps.roleplayModel(textChoice(session, undefined, false)),
      settings: () => deps.settings.load(),
      queuesAfterReply: async (session, after) => {
        const machine = async (kind: JobKind) => machineOf(await jobBackendOf(session, kind))
        const speak = after.speak && !(await featureOff('voices')) && await machine('speak')
        const render = after.picture && after.render && !(await featureOff('images')) &&
          await machine('render')
        const picture = after.picture && await machine('picture')
        // The music is directed first, while the Text Model is loaded for the picture too.
        const direct = after.direct && (await deps.settings.load()).music &&
          await machine('direct')
        const text = textChoiceOf(session)
        const queue = (kind: JobKind, index: number, machine: string) =>
          jobs.enqueue(session.id, kind, index, machine, undefined, undefined, undefined, text)
        return (frame) => {
          if (direct) queue('direct', frame.index, direct)
          if (speak && spokenText(frame, 'dialogue')) queue('speak', frame.index, speak)
          if (picture) queue('picture', frame.index, picture)
          if (render) {
            jobs.enqueue(session.id, 'render', frame.index, render, imageChoiceOf(session))
          }
        }
      },
      jobs,
      store: deps.sessions,
    }),
    ...jobRoutes({
      jobs,
      store: deps.sessions,
      backendOf: jobBackendOf,
      videoModel,
      check: async (session, kind, index, pending, edit, clip) => {
        const feature = JOB_FEATURE[kind]
        const name = frameName(index)
        // A clip is of the Frame's picture by the Session's model, there or coming; Into Next ends
        // on the next Frame's by it, which must be there now.
        const coming = pending.some((k) => k === 'render' || k === 'picture')
        const noNext = kind === 'clip' &&
          clipRefusal(session, index, clip!.kind, name, undefined, coming)
        if (noNext) return (feature && (await featureOff(feature))) ?? error(noNext, 409)
        if (kind === 'edit') {
          const now = await deps.settings.load()
          const model = findEditModel(edit!.model ?? now.editModel)
          const notHere = model && !await heavyBackend(editJob(model.id))
            ? error(`No Backend runs ${model.label}: add one in Settings, on the Machines tab`, 409)
            : null
          return (feature && (await featureOff(feature))) ?? notHere ??
            checkEdit(session, index, name, pending, edit!, model?.id ?? now.editModel)
        }
        if (
          kind === 'direct' || kind === 'score-roleplay' || kind === 'music' || kind === 'steer'
        ) {
          if (!(await deps.settings.load()).music) {
            return error('Music is switched off in Settings', 409)
          }
          if (session.kind !== 'roleplay') return error('Only a Roleplay has music yet', 409)
          if (!session.frames.length) return error('The scene has not begun yet', 409)
        }
        if (kind === 'music' && !await heavyBackend({ kind: 'music' })) {
          return error(
            'No Backend can make music: add a ComfyUI in Settings, on the Machines tab',
            409,
          )
        }
        if (kind === 'style') {
          return (feature && (await featureOff(feature))) ??
            (session.frames.some((f) => f.pictures.length)
              ? null
              : error('No Frame has a picture to score yet', 409))
        }
        return (feature && (await featureOff(feature))) ??
          (session.kind === 'roleplay'
            ? checkRoleplayJob(session, kind, index, pending)
            : session.kind === 'chain'
            ? checkChainJob(session, kind, index, pending)
            : checkStoryboardJob(session, kind, index, pending))
      },
    }),

    ...settingsRoutes(ctx),
    ...scenarioRoutes(ctx),
    ...sessionRoutes(ctx),
    ...pictureRoutes(ctx),
    ...chainRoutes(ctx),
    ...storyboardRoutes(ctx),

    // Every machine's queue, for the queue page: the machines Settings list (the kinds of Backend on
    // each), every Session's jobs with its title, and the Text Model's calls running or waiting.
    ['GET', new URLPattern({ pathname: '/api/queue' }), async () => {
      const { backends } = await deps.settings.load()
      const machines = new Map<string, string[]>()
      for (const b of backends) {
        const key = machineOf(b)
        machines.set(key, [...machines.get(key) ?? [], BACKEND_NAMES[b.kind]])
      }
      const text = renderQueue.textCalls()
      const ids = new Set([
        ...jobs.all().map((s) => s.sessionId),
        ...text.flatMap((c) => c.session ? [c.session] : []),
      ])
      const sessions = (await Promise.all([...ids].map((id) => deps.sessions.load(id))))
        .filter((s) => !!s)
        .map((s) => ({ id: s.id, kind: s.kind, title: titleOf(s) }))
      return json({
        machines: [...machines].map(([key, kinds]) => ({ key, backends: [...new Set(kinds)] })),
        sessions,
        jobs: jobs.all().flatMap(({ sessionId, jobs }) => jobs.map((j) => ({ ...j, sessionId }))),
        text,
      })
    }],

    ['GET', new URLPattern({ pathname: '/api/health' }), () => Promise.resolve(json({ ok: true }))],
  ]

  return async (req) => {
    // Any web page can POST here without asking first, but only as a form or plain text: JSON
    // needs a preflight, which gets no CORS headers. So another site can't use the saved API key
    // (text-models), make Sessions or queue jobs.
    if (req.method === 'POST' && !isJson(req)) return error('Send JSON', 415)
    // The Limits switch follows Settings, so turning it off applies at once, mid-Session too.
    if (new URL(req.url).pathname.startsWith('/api/sessions')) {
      setLimitsEnabled((await deps.settings.load()).limits)
    }
    for (const [method, pattern, handle] of routes) {
      if (req.method !== method) continue
      const match = pattern.exec(req.url)
      if (!match) continue
      try {
        return await handle(req, match.pathname.groups)
      } catch (err) {
        // What the player can act on is answered as such (`refusal.ts`); anything else is a fault.
        if (err instanceof Refusal) return error(err.message, err.status)
        throw err
      }
    }
    return error('Not found', 404)
  }
}
