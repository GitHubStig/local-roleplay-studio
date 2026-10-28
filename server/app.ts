import { extname, join } from '@std/path'
import { error, isJson, json, readJson, type Route } from './http.ts'
import type { ImageGenerator } from './images/imageGenerator.ts'
import {
  anyImageModel,
  findImageModel,
  IMAGE_BACKEND_NAMES,
  IMAGE_BACKENDS,
  type ImageBackendKind,
  imageModelsOf,
} from './images/imageModels.ts'
import type { ComfyStatus } from './comfyui/status.ts'
import { UPSCALERS } from './images/upscalers.ts'
import { crossedLimit, LimitError, setLimitsEnabled } from './limits.ts'
import {
  type Backend,
  BACKEND_NAMES,
  BACKEND_WORK,
  type BackendKind,
  imageKindOf,
} from './backends.ts'
import type { TextChoice, TextModelInfo } from './text/backend.ts'
import { briefScenario, type Scenario, type ScenarioLibrary, summarise } from './scenario.ts'
import {
  type ChainSession,
  excerpt,
  type Session,
  type SessionStore,
  type StoryboardSession,
} from './session.ts'
import {
  sessionSettingsOf,
  type Settings,
  type SettingsStore,
  SIZE_PRESETS,
  validateSettings,
} from './settings.ts'
import type { TextModel } from './textModel.ts'
import type { RoleplayModel } from './roleplay/model.ts'
import type { FigureMaker } from './3d/figure.ts'
import type { SceneMaker } from './3d/scene.ts'
import type { StyleEmbedder } from './style/embedder.ts'
import { embedStyles } from './style/job.ts'
import {
  checkEdit,
  deleteNewestEdit,
  deleteUpscale,
  editFrame,
  pickVersion,
  VersionError,
} from './pictureEdits.ts'
import { EDIT_MODELS, editModelsHere, findEditModel } from './images/editModels.ts'
import { loadStyleCache, StyleScoreError, styleScores, unembedded } from './style/scores.ts'
import type { VoiceEngine } from './voice/voice.ts'
import { roleplayExcerpt } from './roleplay/prompt.ts'
import { roleplayRoutes } from './roleplay/routes.ts'
import { checkRoleplayJob, type RoleplayJobContext, runRoleplayJob } from './roleplay/jobs.ts'
import { restartRoleplay } from './roleplay/engine.ts'
import {
  asQueued,
  type Job,
  JOB_FEATURE,
  type JobEmit,
  jobRoutes,
  SESSION_JOBS,
  SessionJobs,
} from './jobs.ts'
import { logCalls, logCallsUnder } from './calls.ts'
import {
  type Availabilities,
  type Availability,
  type Feature,
  FEATURE_NAMES,
  withBackends,
} from './features.ts'
import { checkChainJob, runChainJob } from './chain/jobs.ts'
import { chainFromStoryboard, CopyError } from './chain/fromStoryboard.ts'
import { checkStoryboardJob, runStoryboardJob } from './storyboard/jobs.ts'
import { GoneError, removeSession, updateSession } from './update.ts'
import {
  comparisonTitle,
  type ExportPage,
  parseComparisonExport,
  writeComparison,
} from './export/comparison.ts'
import {
  deleteModelPictures,
  ImageModelError,
  pickedVersion,
  removeFiles,
  shownPicture,
  switchImageModel,
} from './pictures.ts'
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
import { type FrameDeps, type Phase, UpscaleError } from './frames.ts'
import {
  DeleteError,
  deleteFrame,
  EditError,
  runChainFrame,
  setFramePrompt,
  UndoError,
  undoLatestFrame,
} from './chain/frames.ts'
import {
  editFrameByAction,
  FRAME_COUNT,
  insertBeat,
  planStoryboard,
  removeBeat,
  reorderBeats,
  restartStoryboard,
  setBeat,
  setFrameBody,
  setLook,
  StageError,
  writeStoryboard,
} from './storyboard/storyboard.ts'

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
  comfyuiStatus?: (
    baseUrl: string,
    uses: { imageModel?: string; upscaler?: string; voices?: boolean },
  ) => Promise<ComfyStatus>
  scenarios: ScenarioLibrary
  sessions: SessionStore
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
  /** Frees memory before a render, upscale, scene or figure: unloads the Text Model. */
  freeMemory?: (job: HeavyJob | undefined) => Promise<void>
  newSessionId?: () => string
  randomSeed?: () => number
}

/**
 * Frame images: `frame-3-1a2b3c4d.png`, or `frame-3.png` without the unique suffix, edits of them
 * (`edit-3-1a2b3c4d.png`, ADR 0021) and the areas painted for them (`mask-3-1a2b3c4d.png`);
 * `-2048` marks an upscaled one.
 */
const IMAGE_FILE = /^(frame|edit|mask)-\d+(-[0-9a-f]{8})?(-2048)?\.(png|svg)$/
/**
 * A Roleplay's audio: its Character's voice (`voice-1a2b3c4d.wav`, lossless; FLAC from ComfyUI),
 * spoken lines (`speech-3-…`) and spoken thoughts (`thought-3-…`): MP3 (FLAC from ComfyUI), or WAV
 * from before 2026-10-02.
 */
const AUDIO_FILE =
  /^(voice-[0-9a-f]{8}\.(wav|flac)|(speech|thought)-\d+-[0-9a-f]{8}\.(mp3|wav|flac))$/
/**
 * A Roleplay Frame's 2.5D scene (`scene-3-1a2b3c4d.ply`, SHARP) or 3D figure (`figure-3-…`,
 * TripoSplat; `lito-3-…`, LiTo).
 */
const SCENE_FILE = /^(scene|figure|lito)-\d+-[0-9a-f]{8}\.ply$/
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.ply': 'application/octet-stream',
}

const MAX_BRIEF_LENGTH = 4000

function defaultSessionId(): string {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  return `${stamp.slice(0, 8)}-${stamp.slice(8)}-${crypto.randomUUID().slice(0, 4)}`
}

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string')

const defaultSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]

/** One server-sent event of a work stream: its `type`, plus whatever that event carries. */
export type StreamEvent = { type: string; phase?: Phase; [field: string]: unknown }
type LockKind =
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
  /** One image render at a time, across all Sessions. */
  const renderQueue = new RenderQueue({
    freeMemory: deps.freeMemory,
    machineOf: async (job) => machineOf(backendOf(job, await deps.settings.load(), detected)),
  })
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
  }

  /** Takes the Session's lock, or returns a 409 saying what holds it. */
  function lock(id: string, what: LockKind): Response | null {
    const holder = locks.get(id)
    if (holder) return error(BUSY_MESSAGES[holder], 409)
    locks.set(id, what)
    return null
  }
  const unlock = (id: string) => locks.delete(id)

  async function loadSession(id: string): Promise<Session | Response> {
    return (await deps.sessions.load(id)) ?? error('Session not found', 404)
  }

  /** A Session's title: its Scenario's (`scenarioTitle`), or the start of its typed Brief. */
  const titleOf = (session: Session, scenarioTitle: string | undefined) =>
    session.brief ? briefScenario(session.brief).title : scenarioTitle ?? session.scenarioId ?? ''

  /** The Scenario a Session starts from: its saved Scenario, or its typed Brief. */
  async function scenarioFor(session: Session): Promise<Scenario | Response> {
    if (session.brief) return briefScenario(session.brief)
    const scenario = session.scenarioId ? await deps.scenarios.get(session.scenarioId) : undefined
    return scenario ?? error(`Scenario "${session.scenarioId}" no longer exists`, 409)
  }

  /**
   * A Session's Text Model (or another), with its Thinking unless given, and seeded from its seed.
   */
  const textChoice = (
    session: Session,
    model = session.settings.textModel,
    thinking = session.settings.thinking ?? false,
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
            () => run(send, controller.signal),
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
    handle: (session: Session) => Promise<Response>,
  ): Promise<Response> {
    const busy = lock(id, kind)
    if (busy) return busy
    let streaming = false
    try {
      const session = await loadSession(id)
      if (session instanceof Response) return session
      const res = await handle(session)
      streaming = res.headers.get('Content-Type') === 'text/event-stream'
      return res
    } catch (err) {
      if (err instanceof LimitError) return error(err.message, 422)
      if (err instanceof UndoError || err instanceof UpscaleError || err instanceof StageError) {
        return error(err.message, 409)
      }
      throw err
    } finally {
      if (!streaming) unlock(id)
    }
  }

  const needsChain = (s: Session): s is ChainSession => s.kind === 'chain'
  const needsStoryboard = (s: Session): s is StoryboardSession => s.kind === 'storyboard'
  const frameIndexOf = (s: Session, raw: string | undefined): number | Response => {
    const index = Number(raw)
    if (!Number.isInteger(index) || !s.frames[index]) return error('No such Frame', 404)
    return index
  }

  const roleplayDeps = (session: Session) => ({
    store: deps.sessions,
    imageGenerator: deps.imageGenerator,
    renderQueue,
    previews,
    settings: () => deps.settings.load(),
    backendOf: heavyBackend,
    textModel: deps.textModel(textChoice(session)),
    roleplayModel: deps.roleplayModel(textChoice(session)),
    voice: deps.voice,
    scene: deps.scene,
    figure: deps.figure,
    lito: deps.lito,
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
  const roleplayJobs: RoleplayJobContext = {
    store: deps.sessions,
    deps: roleplayDeps,
    scenarioFor,
    upscaler,
    // A separate Art Agent model pictures with Thinking off: it made pictures 5–22× slower for no
    // gain in correctness (docs/research/text-models.md).
    artModel: async (session) => {
      const { artModel } = await deps.settings.load()
      return artModel && artModel !== session.settings.textModel
        ? deps.roleplayModel(textChoice(session, artModel, false))
        : undefined
    },
  }
  /** Every Session's background work, run as its kind says: a Roleplay's or a Chain's. */
  const jobs = new SessionJobs(
    async (id, job, emit, signal) => {
      const { callLog } = await deps.settings.load()
      return logCalls(
        callLog,
        deps.sessions.dir(id),
        // A voice or the style scores belong to the Session, not the Frame 0 they're queued as.
        SESSION_JOBS.includes(job.kind) ? null : job.frameIndex,
        () => runJob(id, job, emit, signal),
      )
    },
    // An edit cancelled or dismissed: the area painted for it, saved as it was queued, goes too.
    (id, job) => {
      if (job.edit?.mask) removeFiles(deps.sessions.dir(id), [job.edit.mask])
    },
  )

  async function runJob(id: string, job: Job, emit: JobEmit, signal: AbortSignal) {
    const loaded = await deps.sessions.load(id)
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
      return runRoleplayJob(roleplayJobs, session, job, emit, signal)
    }
    if (session?.kind === 'chain' || session?.kind === 'storyboard') {
      const pictureDeps = {
        ...frameDeps(session),
        scene: deps.scene,
        figure: deps.figure,
        lito: deps.lito,
        upscaler,
      }
      return session.kind === 'chain'
        ? runChainJob(pictureDeps, session, job, emit, signal)
        : runStoryboardJob(pictureDeps, session, job, emit, signal)
    }
    throw new GoneError('This Session no longer exists')
  }

  /** Settings as the browser sees them: which Backends have an API key, never the keys. */
  const shownSettings = async (settings: Settings) => ({
    ...settings,
    apiKeysSet: (await Promise.all(
      settings.backends.map(async (b) => (await deps.settings.loadApiKey(b.id)) ? [b.id] : []),
    )).flat(),
  })

  /** The Backend Settings send a Text Model to now; their preferred text Backend, if not told. */
  const textBackendOf = async (model: string) =>
    deps.textBackendOf
      ? deps.textBackendOf(model)
      : textBackendFor(await deps.settings.load(), model, () => Promise.resolve([]))

  /** A text Backend's models for Settings to offer, or why it couldn't list them. */
  async function textModelOptions(backend: Backend | undefined, apiKey?: string) {
    let models: TextModelInfo[] = []
    let textModelsError: string | undefined
    try {
      if (!backend) throw new Error('none is listed, on the Machines tab')
      models = await deps.listTextModels(backend, apiKey)
    } catch (err) {
      const name = backend ? BACKEND_NAMES[backend.kind] : 'a text Backend'
      textModelsError = `Could not reach ${name}: ${(err as Error).message}`
    }
    return {
      textModels: models.map((m) => m.name),
      thinkingModels: models.filter((m) => m.thinking).map((m) => m.name),
      textModelsError,
    }
  }

  const routes: Route[] = [
    ...roleplayRoutes({
      locked,
      stream,
      scenarioFor,
      deps: roleplayDeps,
      // Thinking off, as for pictures: a suggestion is a draft, and it should come quickly.
      suggestModel: (session) => deps.roleplayModel(textChoice(session, undefined, false)),
      jobs,
      store: deps.sessions,
    }),
    ...jobRoutes({
      jobs,
      store: deps.sessions,
      backendOf: async (session, kind, edit) => {
        const now = await deps.settings.load()
        // A picture is written by the Art Agent's model, the Session's Text Model unless set.
        const text = kind === 'picture'
          ? await textBackendOf(now.artModel || session.settings.textModel)
          : undefined
        return jobBackend(kind, session.settings, now, detected, {
          editModel: edit?.model,
          editBackend: edit?.backend,
          text,
        })
      },
      check: async (session, kind, index, pending, edit) => {
        const feature = JOB_FEATURE[kind]
        if (kind === 'edit') {
          const name = session.kind === 'storyboard' ? `Frame ${index + 1}` : `Frame ${index}`
          const now = await deps.settings.load()
          const model = findEditModel(edit!.model ?? now.editModel)
          const notHere = model && !await heavyBackend(editJob(model.id))
            ? error(`No Backend runs ${model.label}: add one in Settings, on the Machines tab`, 409)
            : null
          return (feature && (await featureOff(feature))) ?? notHere ??
            checkEdit(session, index, name, pending, edit!)
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

    ['GET', new URLPattern({ pathname: '/api/health' }), () => Promise.resolve(json({ ok: true }))],

    [
      'GET',
      new URLPattern({ pathname: '/api/settings' }),
      async () => json(await shownSettings(await deps.settings.load())),
    ],

    // `apiKeys` maps a Backend's id to a key that replaces its saved one ('' removes it); one left
    // out is kept, while the Backend is.
    ['PUT', new URLPattern({ pathname: '/api/settings' }), async (req) => {
      const body = await readJson(req)
      if (body === undefined) return error('Body must be JSON', 400)
      const result = validateSettings(body)
      if (!result.ok) return error('Invalid settings', 400, { issues: result.issues })
      await deps.settings.save(result.settings)
      const { apiKeys } = body as { apiKeys?: unknown }
      if (typeof apiKeys === 'object' && apiKeys !== null) {
        for (const [id, key] of Object.entries(apiKeys)) {
          const listed = result.settings.backends.some((b) => b.id === id)
          if (listed && typeof key === 'string') await deps.settings.saveApiKey(id, key.trim())
        }
      }
      return json(await shownSettings(result.settings))
    }],

    // Whether a ComfyUI is up at an address not saved yet, and can run what Settings would send
    // it: the Image Model's files, the upscaler's, and voices' nodes.
    ['POST', new URLPattern({ pathname: '/api/settings/comfyui' }), async (req) => {
      const body = await readJson(req) as
        | { address?: unknown; imageModel?: unknown; upscaler?: unknown; voices?: unknown }
        | undefined
      const optional = (v: unknown) => v === undefined || typeof v === 'string'
      if (
        typeof body?.address !== 'string' || !optional(body.imageModel) ||
        !optional(body.upscaler) || (body.voices !== undefined && typeof body.voices !== 'boolean')
      ) {
        return error('Give an address, and an imageModel, an upscaler or voices to check', 400)
      }
      if (!deps.comfyuiStatus) return error("ComfyUI isn't set up on this server", 409)
      const { imageModel, upscaler, voices } = body as {
        imageModel?: string
        upscaler?: string
        voices?: boolean
      }
      return json(
        await deps.comfyuiStatus(body.address.trim(), { imageModel, upscaler, voices }),
      )
    }],

    // The models on a text Backend not saved yet, for Settings to offer as it's changed: with
    // `apiKey`, or the saved key of the Backend with that `id`.
    ['POST', new URLPattern({ pathname: '/api/settings/text-models' }), async (req) => {
      const body = await readJson(req) as Record<string, unknown> | undefined
      const kind = body?.kind as BackendKind
      if (!BACKEND_WORK[kind]?.includes('text') || typeof body?.address !== 'string') {
        return error('Give the kind of a text Backend, and its address', 400)
      }
      const id = typeof body.id === 'string' ? body.id : ''
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : undefined
      return json(await textModelOptions({ id, kind, address: body.address.trim() }, apiKey))
    }],

    ['GET', new URLPattern({ pathname: '/api/settings/options' }), async () => {
      const now = await deps.settings.load()
      return json({
        ...await textModelOptions(now.backends.find((b) => b.id === now.runOn.text)),
        // Every backend's, so Settings can switch between them.
        imageModels: Object.fromEntries(IMAGE_BACKENDS.map((b) => [b, imageModelsOf(b)])),
        imageBackends: await imageBackends(),
        // Where each Image Model's renders go now, for the Session's picker to say (ADR 0022).
        imageModelsOn: Object.fromEntries(
          IMAGE_BACKENDS.flatMap((kind) => imageModelsOf(kind).map((m) => m.id))
            .map((id) => [id, backendOf({ kind: 'render', model: id }, now, detected)] as const)
            .flatMap(([id, backend]) => {
              const kind = backend && imageKindOf(backend)
              return kind ? [[id, kind]] : []
            }),
        ),
        sizePresets: SIZE_PRESETS,
        upscalers: UPSCALERS,
        editModels: editModelsHere(await imageBackends()),
        // Where each edit model's edits go now, for the Edit dialog to say.
        editModelsOn: Object.fromEntries(
          EDIT_MODELS.flatMap((m) => {
            const backend = backendOf(editJob(m.id), now, detected)
            const kind = backend && imageKindOf(backend)
            return kind ? [[m.id, kind]] : []
          }),
        ),
        features: await availability(),
        // What this machine's own Backend runs, whatever else is listed.
        here: detected,
      })
    }],

    ['GET', new URLPattern({ pathname: '/api/scenarios' }), async () => {
      const { scenarios, errors } = await deps.scenarios.list()
      return json({ scenarios: scenarios.map(summarise), errors })
    }],

    // --- Sessions ------------------------------------------------------------------------------

    ['POST', new URLPattern({ pathname: '/api/sessions' }), async (req) => {
      const body = await readJson(req) as
        | { kind?: unknown; scenarioId?: unknown; brief?: unknown; frameCount?: unknown }
        | undefined
      const kind = body?.kind ?? 'chain'
      if (kind !== 'chain' && kind !== 'storyboard' && kind !== 'roleplay') {
        return error('kind must be "chain", "storyboard" or "roleplay"', 400)
      }
      const scenarioId = typeof body?.scenarioId === 'string' ? body.scenarioId : null
      const brief = typeof body?.brief === 'string' && body.brief.trim() ? body.brief.trim() : null
      if (!scenarioId === !brief) return error('Give either a scenarioId or a brief', 400)
      if (brief && brief.length > MAX_BRIEF_LENGTH) {
        return error(`A Brief can be at most ${MAX_BRIEF_LENGTH} characters`, 400)
      }
      if (brief) {
        const limit = crossedLimit(brief)?.message
        if (limit) return error(`The Brief crosses a limit: ${limit}`, 422)
      }
      if (scenarioId && !(await deps.scenarios.get(scenarioId))) {
        return error('Scenario not found', 404)
      }
      let frameCount = FRAME_COUNT.default
      if (kind === 'storyboard' && body?.frameCount !== undefined) {
        frameCount = Number(body.frameCount)
        if (
          !Number.isInteger(frameCount) || frameCount < FRAME_COUNT.min ||
          frameCount > FRAME_COUNT.max
        ) {
          return error(`frameCount must be ${FRAME_COUNT.min}–${FRAME_COUNT.max}`, 400)
        }
      }
      const settings = await deps.settings.load()
      if (!settings.textModel) return error('Choose a Text Model in Settings first', 400)
      const base = {
        id: newSessionId(),
        brief,
        scenarioId,
        settings: sessionSettingsOf(settings),
        seed: settings.seedMode === 'fixed' ? settings.seed : randomSeed(),
        createdAt: new Date().toISOString(),
      }
      // Every kind starts without pictures: a Chain then only writes each Frame's prompt, to
      // render later, as a Storyboard and a Roleplay do until a render is asked for.
      const session: Session = kind === 'chain'
        ? { ...base, kind, frames: [], renderFrames: !(await featureOff('images')) }
        : kind === 'roleplay'
        ? { ...base, kind, cast: null, frames: [] }
        : { ...base, kind, frameCount, look: null, frames: [] }
      await deps.sessions.save(session)
      return json(session, 201)
    }],

    ['GET', new URLPattern({ pathname: '/api/sessions' }), async () => {
      const [sessions, { scenarios }] = await Promise.all([
        deps.sessions.list(),
        deps.scenarios.list(),
      ])
      const titles = new Map(scenarios.map((s) => [s.id, s.title]))
      const summaries = sessions.map((s) => {
        const updatedAt = s.frames.reduce(
          (latest, f) => f.createdAt > latest ? f.createdAt : latest,
          s.createdAt,
        )
        return {
          id: s.id,
          kind: s.kind,
          scenarioId: s.scenarioId,
          title: titleOf(s, titles.get(s.scenarioId ?? '')),
          frames: s.frames.length,
          latestImage: s.frames.map((f) => {
            const picture = shownPicture(f, s.settings.imageModel)
            return picture && pickedVersion(picture).image
          })
            .findLast((image) => image) ?? null,
          // Shown in place of a picture until there is one: a Roleplay's latest line, a Chain's
          // latest Narration, a Storyboard's first Beat.
          excerpt: s.kind === 'roleplay'
            ? roleplayExcerpt(s)
            : excerpt(s.kind === 'chain' ? s.frames.at(-1)?.narration : s.frames[0]?.beat),
          createdAt: s.createdAt,
          updatedAt,
          activity: active.get(s.id)?.phase ?? jobs.activity(s.id),
        }
      })
      summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      return json(summaries)
    }],

    [
      'DELETE',
      new URLPattern({ pathname: '/api/sessions/:id' }),
      (_req, p) =>
        locked(p.id!, 'delete', async (session) => {
          jobs.cancelWhere(session.id, () => true)
          await removeSession(deps.sessions, session.id)
          return new Response(null, { status: 204 })
        }),
    ],

    ['GET', new URLPattern({ pathname: '/api/sessions/:id' }), async (_req, p) => {
      const session = await deps.sessions.load(p.id!)
      if (!session) return error('Session not found', 404)
      // `activity` lets a screen that didn't start the running work (another tab) show it.
      const work = active.get(session.id)
      // The size its pictures render at (as Settings are now), so a screen can shape the frame
      // before the first arrives.
      const { size } = await deps.settings.load()
      const { width, height } = SIZE_PRESETS.find((p) => p.id === size) ?? SIZE_PRESETS[0]
      const scenario = session.scenarioId ? await deps.scenarios.get(session.scenarioId) : undefined
      return json({
        ...session,
        title: titleOf(session, scenario?.title),
        activity: work?.phase ?? null,
        activeFrame: work?.frameIndex ?? null,
        imageSize: { width, height },
      })
    }],

    // Switches the Session's Image Model: `{ imageModel, imageBackend? }`, by name, and the kind of
    // backend it would rather render on, if picked (ADR 0022): one a Backend listed can render.
    ['PUT', new URLPattern({ pathname: '/api/sessions/:id/image-model' }), async (req, p) => {
      const body = await readJson(req) as
        | { imageModel?: unknown; imageBackend?: unknown }
        | undefined
      if (typeof body?.imageModel !== 'string') return error('imageModel must be a string', 400)
      const on = body.imageBackend as ImageBackendKind | undefined
      if (on !== undefined && !IMAGE_BACKENDS.includes(on)) {
        return error(`imageBackend must be one of: ${IMAGE_BACKENDS.join(', ')}`, 400)
      }
      if (on && anyImageModel(body.imageModel) && !findImageModel(on, body.imageModel)) {
        return error(`${IMAGE_BACKEND_NAMES[on]} has no Image Model "${body.imageModel}"`, 400)
      }
      const session = await deps.sessions.load(p.id!)
      if (!session) return error('Session not found', 404)
      const backend = await heavyBackend({ kind: 'render', model: body.imageModel, on })
      if (
        !backend && body.imageModel !== session.settings.imageModel &&
        anyImageModel(body.imageModel)
      ) {
        return error(
          `No Backend renders ${body.imageModel}: add one in Settings, on the Machines tab`,
          409,
        )
      }
      try {
        return json(await switchImageModel(deps.sessions, session, body.imageModel, on))
      } catch (err) {
        if (err instanceof ImageModelError) return error(err.message, 400)
        throw err
      }
    }],

    // Deletes every picture by one Image Model (`?imageModel=`), with its upscales and 3D, from
    // Compare's hidden columns; not the Session's own model. Sends back the Session, and how many
    // pictures went.
    ['DELETE', new URLPattern({ pathname: '/api/sessions/:id/pictures' }), async (req, p) => {
      const model = new URL(req.url).searchParams.get('imageModel')
      if (!model) return error('imageModel is required', 400)
      const session = await deps.sessions.load(p.id!)
      if (!session) return error('Session not found', 404)
      try {
        return json(await deleteModelPictures(deps.sessions, session, model))
      } catch (err) {
        if (err instanceof ImageModelError) return error(err.message, 409)
        throw err
      }
    }],

    // Picks which version of Frame `:index`'s picture is the picture (ADR 0021): `{ picked }`, 0
    // for its render, n for its edit n. Sends back the Session.
    [
      'PUT',
      new URLPattern({ pathname: '/api/sessions/:id/pictures/:index/picked' }),
      async (req, p) => {
        const body = await readJson(req) as { picked?: unknown } | undefined
        const session = await deps.sessions.load(p.id!)
        if (!session) return error('Session not found', 404)
        try {
          return json(
            await pickVersion(deps.sessions, session, Number(p.index), Number(body?.picked)),
          )
        } catch (err) {
          if (err instanceof VersionError) return error(err.message, 409)
          throw err
        }
      },
    ],

    // Deletes the newest edit of Frame `:index`'s picture, unless an edit is queued or running on
    // it (made from it, or making it again). Sends back the Session.
    [
      'DELETE',
      new URLPattern({ pathname: '/api/sessions/:id/pictures/:index/edits/newest' }),
      async (_req, p) => {
        const session = await deps.sessions.load(p.id!)
        if (!session) return error('Session not found', 404)
        const index = Number(p.index)
        const editing = jobs.list(session.id)
          .some((j) => j.kind === 'edit' && j.frameIndex === index && j.status !== 'failed')
        if (editing) return error('That picture is being edited: wait for it first', 409)
        try {
          return json(await deleteNewestEdit(deps.sessions, session, index))
        } catch (err) {
          if (err instanceof VersionError) return error(err.message, 409)
          throw err
        }
      },
    ],

    // Deletes the upscale of the picked version of Frame `:index`'s picture, unless one is queued
    // or running on the Frame. Sends back the Session.
    [
      'DELETE',
      new URLPattern({ pathname: '/api/sessions/:id/pictures/:index/upscale' }),
      async (_req, p) => {
        const session = await deps.sessions.load(p.id!)
        if (!session) return error('Session not found', 404)
        const index = Number(p.index)
        const upscaling = jobs.list(session.id)
          .some((j) => j.kind === 'upscale' && j.frameIndex === index && j.status !== 'failed')
        if (upscaling) return error('That picture is being upscaled: wait for it first', 409)
        try {
          return json(await deleteUpscale(deps.sessions, session, index))
        } catch (err) {
          if (err instanceof VersionError) return error(err.message, 409)
          throw err
        }
      },
    ],

    ['POST', new URLPattern({ pathname: '/api/sessions/:id/cancel' }), (_req, p) => {
      active.get(p.id!)?.controller.abort(new Error('Cancelled by player'))
      return Promise.resolve(new Response(null, { status: 204 }))
    }],

    // --- Chains --------------------------------------------------------------------------------

    [
      'POST',
      new URLPattern({ pathname: '/api/sessions/:id/frames' }),
      (req, p) =>
        locked(p.id!, 'frame', async (session) => {
          if (!needsChain(session)) return error('Only a Chain makes Frames from Actions', 409)
          // Rendered as it's made only while the Chain says so and pictures are on.
          const render = session.renderFrames !== false && !(await featureOff('images'))
          const body = await readJson(req) as { action?: unknown } | undefined
          const opening = session.frames.length === 0
          let action: string | null = null
          if (!opening) {
            if (typeof body?.action !== 'string' || !body.action.trim()) {
              return error('action is required', 400)
            }
            action = body.action.trim()
          }
          const scenario = await scenarioFor(session)
          if (scenario instanceof Response) return scenario
          return stream(session, null, opening, async (send, signal) => {
            // The Frame being made, though the stream isn't one Frame's until it's saved.
            await logCallsUnder(
              session.frames.length,
              () =>
                runChainFrame(frameDeps(session), session, scenario, action, send, signal, render),
            )
          })
        }),
    ],

    // Whether a Chain renders each Frame as it's made: `{ renderFrames }`.
    ['PUT', new URLPattern({ pathname: '/api/sessions/:id/render-frames' }), async (req, p) => {
      const body = await readJson(req) as { renderFrames?: unknown } | undefined
      if (typeof body?.renderFrames !== 'boolean') {
        return error('renderFrames must be true or false', 400)
      }
      const session = await deps.sessions.load(p.id!)
      if (!session) return error('Session not found', 404)
      if (!needsChain(session)) return error('Only a Chain renders Frames as they are made', 409)
      if (body.renderFrames) {
        const off = await featureOff('images')
        if (off) return off
      }
      return json(
        await updateSession(deps.sessions, session.id, 'chain', (latest) => ({
          ...latest,
          renderFrames: body.renderFrames as boolean,
        })),
      )
    }],

    ['DELETE', new URLPattern({ pathname: '/api/sessions/:id/frames/:index' }), (_req, p) => {
      const index = Number(p.index)
      if (!Number.isInteger(index)) {
        return Promise.resolve(error('Frame index must be a number', 400))
      }
      return locked(p.id!, 'undo', async (session) => {
        if (!needsChain(session)) return error('Only a Chain has Undo', 409)
        const undone = await undoLatestFrame(deps.sessions, session, index)
        jobs.cancelWhere(session.id, (job) => job.frameIndex === index)
        return json(undone)
      })
    }],

    // Deletes a Chain's Frame, any but the Opening Frame, or a Storyboard's Beat while it's planned:
    // `{ frames, createdAt }`, how many Frames it had and when this one was made, so a repeated
    // request can't delete the one after it. A Chain's is refused while a job runs on it; jobs on
    // later Frames, queued or running, follow them as they're numbered down.
    ['POST', new URLPattern({ pathname: '/api/sessions/:id/frames/:index/delete' }), (req, p) => {
      const index = Number(p.index)
      if (!Number.isInteger(index)) {
        return Promise.resolve(error('Frame index must be a number', 400))
      }
      return locked(p.id!, 'delete-frame', async (session) => {
        if (!needsChain(session) && !needsStoryboard(session)) {
          return error('Only a Chain or a Storyboard deletes Frames this way', 409)
        }
        const body = await readJson(req) as { frames?: unknown; createdAt?: unknown } | undefined
        if (typeof body?.createdAt !== 'string' || !Number.isInteger(body.frames)) {
          return error('frames (a count) and createdAt are required', 400)
        }
        const seen = { frames: body.frames as number, createdAt: body.createdAt }
        // A Storyboard's Beat, before its Frames are written: nothing is rendered or queued yet.
        if (needsStoryboard(session)) {
          try {
            return json(await removeBeat({ store: deps.sessions }, session, index, seen))
          } catch (err) {
            if (err instanceof GoneError) return error(err.message, 409)
            throw err
          }
        }
        const running = jobs.list(session.id)
          .find((j) => j.status === 'running' && j.frameIndex === index)
        if (running) {
          return error(
            `Frame ${index} has a job running: wait for it, or cancel it, then delete`,
            409,
          )
        }
        try {
          return json(
            await jobs.holding(session.id, async () => {
              const updated = await deleteFrame(deps.sessions, session, index, seen)
              jobs.frameDeleted(session.id, index)
              return updated
            }),
          )
        } catch (err) {
          if (err instanceof DeleteError || err instanceof GoneError) return error(err.message, 409)
          throw err
        }
      })
    }],

    // --- Storyboards ---------------------------------------------------------------------------

    [
      'POST',
      new URLPattern({ pathname: '/api/sessions/:id/plan' }),
      (_req, p) =>
        locked(p.id!, 'plan', async (session) => {
          if (!needsStoryboard(session)) return error('Only a Storyboard is planned', 409)
          if (session.frames.length > 0) return error('This Storyboard is already planned', 409)
          const scenario = await scenarioFor(session)
          if (scenario instanceof Response) return scenario
          // A Storyboard that never got planned never started, like a Chain's Opening Frame.
          return stream(session, null, true, async (send, signal) => {
            await planStoryboard(frameDeps(session), session, scenario, send, signal)
          })
        }),
    ],

    // Writes the Frames of a reviewed plan, a call per Frame, each saved as it comes: a failure or
    // Cancel keeps those written, and writing again carries on from the next.
    [
      'POST',
      new URLPattern({ pathname: '/api/sessions/:id/write' }),
      (_req, p) =>
        locked(p.id!, 'write', async (session) => {
          if (!needsStoryboard(session)) return error('Only a Storyboard writes its Frames', 409)
          const scenario = await scenarioFor(session)
          if (scenario instanceof Response) return scenario
          // Refused up front, before the stream: nothing to write, or not planned yet.
          if (!session.look || session.frames.every((f) => f.body)) {
            return error(
              session.look ? 'Every Frame is written already' : 'Plan the Storyboard first',
              409,
            )
          }
          return stream(session, null, false, async (send, signal) => {
            await writeStoryboard(frameDeps(session), session, scenario, send, signal)
          })
        }),
    ],

    // A Storyboard back to the plan: every Frame's sentences and pictures go, so the Look and
    // Beats can be edited again. A Roleplay back to its Cast: every exchange goes, the opening too.
    // Their jobs are cancelled (all but a Roleplay's voice, which stays), and it waits for a render
    // running to end.
    [
      'POST',
      new URLPattern({ pathname: '/api/sessions/:id/restart' }),
      async (_req, p) => {
        // Only these kinds' jobs are cancelled, so it's checked before taking the lock.
        const found = await deps.sessions.load(p.id!)
        if (found?.kind !== 'storyboard' && found?.kind !== 'roleplay') {
          return error(
            found ? 'Only a Storyboard or a Roleplay restarts' : 'Session not found',
            found ? 409 : 404,
          )
        }
        const cancelled = (job: Job) => found.kind === 'storyboard' || job.kind !== 'voice'
        jobs.cancelWhere(p.id!, cancelled)
        return jobs.betweenRenders(p.id!, () =>
          locked(p.id!, 'edit', async (session) => {
            if (session.kind === 'roleplay') {
              if (!session.frames.length) return error('The scene has not begun yet', 409)
              jobs.cancelWhere(session.id, cancelled)
              return json(await restartRoleplay(deps.sessions, session))
            }
            if (!needsStoryboard(session) || !session.look) {
              return error('Only a planned Storyboard restarts', 409)
            }
            jobs.cancelWhere(session.id, cancelled)
            return json(await restartStoryboard({ store: deps.sessions }, session))
          }))
      },
    ],

    [
      'POST',
      new URLPattern({ pathname: '/api/sessions/:id/frames/:index/edit' }),
      (req, p) =>
        locked(p.id!, 'edit', async (session) => {
          if (!needsStoryboard(session)) {
            return error('Only a Storyboard edits Frames in place', 409)
          }
          const index = frameIndexOf(session, p.index)
          if (index instanceof Response) {
            return index
          }
          const body = await readJson(req) as { action?: unknown } | undefined
          if (typeof body?.action !== 'string' || !body.action.trim()) {
            return error('action is required', 400)
          }
          const action = body.action.trim()
          const scenario = await scenarioFor(session)
          if (scenario instanceof Response) return scenario
          return stream(session, index, false, async (send, signal) => {
            const result = await editFrameByAction(
              frameDeps(session),
              session,
              scenario,
              index,
              action,
              send,
              signal,
            )
            send({ type: 'edited', ...result })
          })
        }),
    ],

    // A Frame edited by hand: a Storyboard's `{ body, shown }` (`{ beat, shown }`, its Beat, before
    // its Frames are written), or a Chain's `{ prompt }`, its
    // Image Prompt, which marks its pictures out of date.
    [
      'PUT',
      new URLPattern({ pathname: '/api/sessions/:id/frames/:index' }),
      (req, p) =>
        locked(p.id!, 'edit', async (session) => {
          if (!needsChain(session) && !needsStoryboard(session)) {
            return error('A Roleplay edits its Frames its own way', 409)
          }
          const index = frameIndexOf(session, p.index)
          if (index instanceof Response) return index
          if (needsChain(session)) {
            const body = await readJson(req) as { prompt?: unknown } | undefined
            if (typeof body?.prompt !== 'string') return error('prompt is required', 400)
            try {
              return json(await setFramePrompt(deps.sessions, session, index, body.prompt))
            } catch (err) {
              if (err instanceof EditError) return error(err.message, 400)
              if (err instanceof GoneError) return error(err.message, 409)
              throw err
            }
          }
          const body = await readJson(req) as
            | { body?: unknown; beat?: unknown; shown?: unknown }
            | undefined
          if (body?.shown !== undefined && !isStringList(body.shown)) {
            return error('shown must be a list of names', 400)
          }
          // Before the Frames are written, its Beat; after, its sentences.
          if (typeof body?.beat === 'string') {
            return json(
              await setBeat({ store: deps.sessions }, session, index, body.beat, body.shown),
            )
          }
          if (typeof body?.body !== 'string') return error('body or beat is required', 400)
          return json(
            await setFrameBody({ store: deps.sessions }, session, index, body.body, body.shown),
          )
        }),
    ],

    // A Beat added to a Storyboard's plan by hand, `{ at, beat, shown }`, before its Frames are
    // written: the Frames from `at` on move up one.
    [
      'POST',
      new URLPattern({ pathname: '/api/sessions/:id/beats' }),
      (req, p) =>
        locked(p.id!, 'edit', async (session) => {
          if (!needsStoryboard(session)) return error('Only a Storyboard has Beats', 409)
          const body = await readJson(req) as
            | { at?: unknown; beat?: unknown; shown?: unknown }
            | undefined
          if (typeof body?.beat !== 'string' || !body.beat.trim()) {
            return error('beat is required', 400)
          }
          const at = body.at
          if (
            typeof at !== 'number' || !Number.isInteger(at) || at < 0 || at > session.frames.length
          ) {
            return error(`at must be 0 to ${session.frames.length}`, 400)
          }
          if (body.shown !== undefined && !isStringList(body.shown)) {
            return error('shown must be a list of names', 400)
          }
          const added = await insertBeat(
            { store: deps.sessions },
            session,
            at,
            body.beat,
            body.shown,
          )
          return json(added, 201)
        }),
    ],

    // A Storyboard's Beats in a new order, before its Frames are written: `{ order, seen }`, the
    // index each had in its new place, and their lines as seen, in the old order (`409` if they've
    // changed since).
    [
      'PUT',
      new URLPattern({ pathname: '/api/sessions/:id/beats/order' }),
      (req, p) =>
        locked(p.id!, 'edit', async (session) => {
          if (!needsStoryboard(session)) return error('Only a Storyboard has Beats', 409)
          const body = await readJson(req) as { order?: unknown; seen?: unknown } | undefined
          const order = body?.order
          const n = session.frames.length
          const permutation = Array.isArray(order) && order.length === n &&
            [...order].sort((a, b) => a - b).every((i, k) => i === k)
          if (!permutation || !isStringList(body?.seen)) {
            return error(
              `order (each of 0 to ${n - 1} once) and seen (the Beats) are required`,
              400,
            )
          }
          try {
            return json(await reorderBeats({ store: deps.sessions }, session, order, body.seen))
          } catch (err) {
            if (err instanceof GoneError) return error(err.message, 409)
            throw err
          }
        }),
    ],

    // A new Chain from a Storyboard's Frames up to `index`, to carry on from that Frame by
    // Actions; the Storyboard stays as it is. Made between renders, as it copies their pictures.
    [
      'POST',
      new URLPattern({ pathname: '/api/sessions/:id/frames/:index/chain' }),
      (_req, p) =>
        jobs.betweenRenders(p.id!, () =>
          locked(p.id!, 'copy', async (session) => {
            if (!needsStoryboard(session)) {
              return error('Only a Storyboard is made into a Chain', 409)
            }
            const index = frameIndexOf(session, p.index)
            if (index instanceof Response) return index
            try {
              const chain = await chainFromStoryboard(deps.sessions, session, index, {
                id: newSessionId(),
                createdAt: new Date().toISOString(),
                renderFrames: !(await featureOff('images')),
              })
              return json(chain, 201)
            } catch (err) {
              if (err instanceof CopyError) return error(err.message, 409)
              throw err
            }
          })),
    ],

    [
      'PUT',
      new URLPattern({ pathname: '/api/sessions/:id/look' }),
      // Only before the Frames are written (`setLook`), so no render can be using it.
      (req, p) =>
        locked(p.id!, 'edit', async (session) => {
          if (!needsStoryboard(session) || !session.look) {
            return error('Only a planned Storyboard has a Look', 409)
          }
          const body = await readJson(req) as { subjects?: unknown; style?: unknown } | undefined
          const subjects = body?.subjects
          if (
            !Array.isArray(subjects) || typeof body?.style !== 'string' ||
            subjects.some((p) => typeof p?.name !== 'string' || typeof p?.identity !== 'string')
          ) {
            return error('subjects (each with a name and identity) and style are required', 400)
          }
          return json(
            await setLook({ store: deps.sessions }, session, { subjects, style: body.style }),
          )
        }),
    ],

    // The picture forming: the latest preview of the Session's render, while there is one and
    // Settings show it. The browser asks again as the step count moves (`?step=`), so never cached.
    ['GET', new URLPattern({ pathname: '/api/sessions/:id/preview' }), async (_req, p) => {
      const jpeg = previews.get(p.id!)
      if (!jpeg || !(await deps.settings.load()).previews) return error('No preview', 404)
      return new Response(jpeg, {
        headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
      })
    }],

    // The Compare dialog's style scores, against Frame `base`, for the Image Models in `models`
    // (comma-separated; all of them if left out), from the pictures the `style` job embedded.
    ['GET', new URLPattern({ pathname: '/api/sessions/:id/style-scores' }), async (req, p) => {
      const session = await loadSession(p.id!)
      if (session instanceof Response) return session
      const query = new URL(req.url).searchParams
      const base = Number(query.get('base') ?? 0)
      if (!Number.isInteger(base) || !session.frames[base]) return error('No such Frame', 404)
      const models = query.get('models')?.split(',').filter(Boolean)
      const cache = await loadStyleCache(deps.sessions.dir(session.id))
      if (!cache) return error('Not scored yet', 404)
      try {
        const todo = unembedded(session, cache)
        return json({
          ...styleScores(session, cache, base, models),
          unembedded: todo.images.length + todo.texts.length,
        })
      } catch (err) {
        if (err instanceof StyleScoreError) return error(err.message, 409)
        throw err
      }
    }],

    // The Compare dialog as a page of its own, with its pictures as WebP, in a folder under
    // `exports/` named for the Session: `ComparisonExport`. It says where the folder went.
    ['POST', new URLPattern({ pathname: '/api/sessions/:id/export' }), async (req, p) => {
      if (!deps.exports) return error("Exporting isn't set up", 404)
      const comparison = parseComparisonExport(await readJson(req))
      if (typeof comparison === 'string') return error(comparison, 400)
      const session = await deps.sessions.load(p.id!)
      if (!session) return error('Session not found', 404)
      const folder = join(deps.exports.dir, p.id!)
      const { pictures } = await writeComparison(
        deps.sessions.dir(p.id!),
        folder,
        await deps.exports.page(),
        comparison,
        comparisonTitle(new Date(), session.seed),
      )
      return json({ folder, pictures })
    }],

    ['GET', new URLPattern({ pathname: '/api/sessions/:id/images/:file' }), async (_req, p) => {
      if (![IMAGE_FILE, AUDIO_FILE, SCENE_FILE].some((f) => f.test(p.file!))) {
        return error('Not found', 404)
      }
      try {
        const data = await Deno.readFile(join(deps.sessions.dir(p.id!), p.file!))
        return new Response(data, {
          headers: {
            'Content-Type': CONTENT_TYPES[extname(p.file!)],
            'Cache-Control': 'private, max-age=31536000, immutable',
          },
        })
      } catch {
        return error('Not found', 404)
      }
    }],
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
      if (match) return await handle(req, match.pathname.groups)
    }
    return error('Not found', 404)
  }
}
