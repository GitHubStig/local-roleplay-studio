import { extname, join } from '@std/path'
import { error, json, readJson, type Route } from './http.ts'
import type { ImageGenerator } from './images/imageGenerator.ts'
import { IMAGE_MODELS, UPSCALERS } from './images/imageModels.ts'
import { crossedLimit, setLimitsEnabled } from './limits.ts'
import {
  connectionOf,
  TEXT_BACKEND_NAMES,
  TEXT_BACKENDS,
  type TextBackendKind,
  type TextChoice,
  type TextConnection,
  type TextModelInfo,
} from './text/backend.ts'
import { briefScenario, type Scenario, type ScenarioLibrary, summarise } from './scenario.ts'
import type { ChainSession, Session, SessionStore, StoryboardSession } from './session.ts'
import { type Settings, type SettingsStore, SIZE_PRESETS, validateSettings } from './settings.ts'
import type { TextModel } from './textModel.ts'
import type { RoleplayModel } from './roleplay/model.ts'
import type { FigureMaker } from './3d/figure.ts'
import type { SceneMaker } from './3d/scene.ts'
import type { VoiceEngine } from './voice/voice.ts'
import type { QuantizedStore } from './images/quantized.ts'
import { roleplayExcerpt } from './roleplay/prompt.ts'
import { roleplayRoutes } from './roleplay/routes.ts'
import { checkRoleplayJob, type RoleplayJobContext, runRoleplayJob } from './roleplay/jobs.ts'
import { JOB_FEATURE, jobRoutes, SessionJobs } from './jobs.ts'
import { type Availabilities, type Availability, type Feature, FEATURE_NAMES } from './features.ts'
import { checkChainJob, runChainJob } from './chain/jobs.ts'
import { checkStoryboardJob, runStoryboardJob } from './storyboard/jobs.ts'
import { GoneError, updateSession } from './update.ts'
import { RenderQueue } from './renderQueue.ts'
import { type FrameDeps, type Phase, UpscaleError } from './frames.ts'
import { runChainFrame, UndoError, undoLatestFrame } from './chain/frames.ts'
import {
  editFrameByAction,
  LimitError,
  planStoryboard,
  setFrameBody,
  setLook,
} from './storyboard/storyboard.ts'

export interface AppDeps {
  settings: SettingsStore
  /** A Text backend's models; `apiKey` stands in for the saved one (trying a new key). */
  listTextModels: (connection: TextConnection, apiKey?: string) => Promise<TextModelInfo[]>
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
  /**
   * Which extras this machine can run (`detectFeatures`, at startup). Left out, those whose
   * backend is given are available, the rest not: what tests want.
   */
  features?: Availabilities
  /** Frees memory before a render, upscale, scene or figure: unloads the Text Model. */
  freeMemory?: () => Promise<void>
  /** Saved quantized copies of Image Models, listed and deleted from Settings. */
  quantized?: QuantizedStore
  newSessionId?: () => string
  randomSeed?: () => number
}

/**
 * Frame images: `frame-3-1a2b3c4d.png`, or `frame-3.png` without the unique suffix; `-2048` marks
 * an upscaled one.
 */
const IMAGE_FILE = /^frame-\d+(-[0-9a-f]{8})?(-2048)?\.(png|svg)$/
/**
 * A Roleplay's audio: its Character's voice (`voice-1a2b3c4d.wav`, lossless), spoken lines (`speech-3-…`)
 * and spoken thoughts (`thought-3-…`): MP3, or WAV from before 2026-10-02.
 */
const AUDIO_FILE = /^(voice-[0-9a-f]{8}\.wav|(speech|thought)-\d+-[0-9a-f]{8}\.(mp3|wav))$/
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
  '.ply': 'application/octet-stream',
}

/** Storyboards plan between 1 and 16 Frames; 8 unless asked otherwise. */
const FRAME_COUNT = { min: 1, max: 16, default: 8 }
const MAX_BRIEF_LENGTH = 4000

function defaultSessionId(): string {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  return `${stamp.slice(0, 8)}-${stamp.slice(8)}-${crypto.randomUUID().slice(0, 4)}`
}

const defaultSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]

/** One server-sent event of a work stream: its `type`, plus whatever that event carries. */
export type StreamEvent = { type: string; phase?: Phase; [field: string]: unknown }
type LockKind =
  | 'frame'
  | 'undo'
  | 'delete'
  | 'plan'
  | 'render'
  | 'edit'
  | 'upscale'
  | 'setup'
  | 'suggest'

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
  const renderQueue = new RenderQueue({ freeMemory: deps.freeMemory })

  /**
   * What each Session is busy with. Every change to a Session takes this lock *before* reading the
   * Session, so no request ever acts on a copy another request is about to change.
   */
  const locks = new Map<string, LockKind>()
  const BUSY_MESSAGES: Record<LockKind, string> = {
    frame: 'A Frame is already in progress',
    undo: 'An Undo is in progress',
    delete: 'This Session is being deleted',
    plan: 'The Storyboard is being planned',
    render: 'A Frame is rendering',
    edit: 'A Frame is being edited',
    upscale: 'A Frame is being upscaled',
    setup: 'The Roleplay is being set up',
    suggest: 'A message is being suggested',
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

  /** The Scenario a Session starts from: its saved Scenario, or its typed Brief. */
  async function scenarioFor(session: Session): Promise<Scenario | Response> {
    if (session.brief) return briefScenario(session.brief)
    const scenario = session.scenarioId ? await deps.scenarios.get(session.scenarioId) : undefined
    return scenario ?? error(`Scenario "${session.scenarioId}" no longer exists`, 409)
  }

  /** A Session's Text Model (or another model on its backend), with its Thinking unless given. */
  const textChoice = (
    settings: Settings,
    model = settings.textModel,
    thinking = settings.thinking ?? false,
  ): TextChoice => ({ ...connectionOf(settings), model, thinking })

  const frameDeps = (session: Session): FrameDeps => ({
    store: deps.sessions,
    textModel: deps.textModel(textChoice(session.settings)),
    imageGenerator: deps.imageGenerator,
    renderQueue,
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
          await run(send, controller.signal)
        } catch (err) {
          if (discardOnFailure) await deps.sessions.remove(session.id)
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
      if (err instanceof UndoError || err instanceof UpscaleError) return error(err.message, 409)
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
    textModel: deps.textModel(textChoice(session.settings)),
    roleplayModel: deps.roleplayModel(textChoice(session.settings)),
    voice: deps.voice,
    scene: deps.scene,
    figure: deps.figure,
    lito: deps.lito,
  })
  const given = (backend: unknown, what: string): Availability =>
    backend ? { available: true } : { available: false, reason: `No ${what} was set up` }
  const availability: Availabilities = deps.features ?? {
    images: { available: true },
    voices: given(deps.voice, 'voice service'),
    scenes: given(deps.scene, 'SHARP'),
    figures: given(deps.figure, 'TripoSplat'),
    lito: given(deps.lito, 'LiTo'),
  }
  /**
   * Why `feature` can't be used now (a 409 to send back), or null if it can: this machine can't
   * run it, or it's switched off in Settings.
   */
  async function featureOff(feature: Feature): Promise<Response | null> {
    const { available, reason } = availability[feature]
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
    // gain in correctness (docs/models.md).
    artStyle: async () => (await deps.settings.load()).artStyle,
    artModel: async (session) => {
      const { artModel } = await deps.settings.load()
      return artModel && artModel !== session.settings.textModel
        ? deps.roleplayModel(textChoice(session.settings, artModel, false))
        : undefined
    },
  }
  /** Every Session's background work, run as its kind says: a Roleplay's or a Chain's. */
  const jobs = new SessionJobs(async (id, job, emit, signal) => {
    const session = await deps.sessions.load(id)
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
  })

  /** Settings as the browser sees them: whether there's an API key, never the key. */
  const shownSettings = async (settings: Settings) => ({
    ...settings,
    textApiKeySet: !!(await deps.settings.loadApiKey()),
  })

  /** A Text backend's models for Settings to offer, or why it couldn't list them. */
  async function textModelOptions(connection: TextConnection, apiKey?: string) {
    let models: TextModelInfo[] = []
    let textModelsError: string | undefined
    try {
      models = await deps.listTextModels(connection, apiKey)
    } catch (err) {
      textModelsError = `Could not reach ${TEXT_BACKEND_NAMES[connection.backend]}: ${
        (err as Error).message
      }`
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
      suggestModel: (session) => deps.roleplayModel(textChoice(session.settings, undefined, false)),
      jobs,
      store: deps.sessions,
    }),
    ...jobRoutes({
      jobs,
      store: deps.sessions,
      check: async (session, kind, index, pending) =>
        (await featureOff(JOB_FEATURE[kind])) ??
          (session.kind === 'roleplay'
            ? checkRoleplayJob(session, kind, index, pending)
            : session.kind === 'chain'
            ? checkChainJob(session, kind, index, pending)
            : checkStoryboardJob(session, kind, index, pending)),
    }),

    ['GET', new URLPattern({ pathname: '/api/health' }), () => Promise.resolve(json({ ok: true }))],

    [
      'GET',
      new URLPattern({ pathname: '/api/settings' }),
      async () => json(await shownSettings(await deps.settings.load())),
    ],

    // A `textApiKey` string replaces the saved key ('' removes it); left out, it's kept.
    ['PUT', new URLPattern({ pathname: '/api/settings' }), async (req) => {
      const body = await readJson(req)
      if (body === undefined) return error('Body must be JSON', 400)
      const result = validateSettings(body)
      if (!result.ok) return error('Invalid settings', 400, { issues: result.issues })
      await deps.settings.save(result.settings)
      const { textApiKey } = body as { textApiKey?: unknown }
      if (typeof textApiKey === 'string') await deps.settings.saveApiKey(textApiKey.trim())
      return json(await shownSettings(result.settings))
    }],

    // The models on a Text backend not saved yet, for Settings to offer as it's changed.
    ['POST', new URLPattern({ pathname: '/api/settings/text-models' }), async (req) => {
      const body = await readJson(req) as Record<string, unknown> | undefined
      const backend = body?.textBackend as TextBackendKind
      if (!TEXT_BACKENDS.includes(backend) || typeof body?.textBaseUrl !== 'string') {
        return error('Give a textBackend and a textBaseUrl', 400)
      }
      const apiKey = typeof body.textApiKey === 'string' ? body.textApiKey.trim() : undefined
      return json(await textModelOptions({ backend, baseUrl: body.textBaseUrl.trim() }, apiKey))
    }],

    // Saved quantized copies of Image Models: made by the first render that needs one.
    [
      'GET',
      new URLPattern({ pathname: '/api/settings/quantized' }),
      async () => json(await deps.quantized?.list() ?? []),
    ],

    [
      'DELETE',
      new URLPattern({ pathname: '/api/settings/quantized/:name' }),
      async (_req, p) =>
        (await deps.quantized?.remove(p.name!))
          ? json(await deps.quantized!.list())
          : error('No such saved copy', 404),
    ],

    ['GET', new URLPattern({ pathname: '/api/settings/options' }), async () => {
      return json({
        ...await textModelOptions(connectionOf(await deps.settings.load())),
        imageModels: IMAGE_MODELS.map(({ id, label, defaultSteps, stepCache, fast }) => ({
          id,
          label,
          defaultSteps,
          stepCache: !!stepCache,
          fastSteps: fast?.steps,
        })),
        sizePresets: SIZE_PRESETS,
        upscalers: UPSCALERS,
        features: availability,
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
        settings,
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
        const rendered = s.frames.filter((f) => f.image)
        const updatedAt = s.frames.reduce(
          (latest, f) => f.createdAt > latest ? f.createdAt : latest,
          s.createdAt,
        )
        return {
          id: s.id,
          kind: s.kind,
          scenarioId: s.scenarioId,
          title: s.brief
            ? briefScenario(s.brief).title
            : titles.get(s.scenarioId ?? '') ?? s.scenarioId,
          frames: s.frames.length,
          latestImage: rendered.at(-1)?.image ?? null,
          // A Roleplay has no images yet: its card shows the Character's latest line instead.
          ...(s.kind === 'roleplay' ? { excerpt: roleplayExcerpt(s) } : {}),
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
          await deps.sessions.remove(session.id)
          return new Response(null, { status: 204 })
        }),
    ],

    ['GET', new URLPattern({ pathname: '/api/sessions/:id' }), async (_req, p) => {
      const session = await deps.sessions.load(p.id!)
      if (!session) return error('Session not found', 404)
      // `activity` lets a screen that didn't start the running work (another tab) show it.
      const work = active.get(session.id)
      // The size its pictures render at, so a screen can shape the frame before the first arrives.
      const { width, height } = SIZE_PRESETS.find((p) => p.id === session.settings.size) ??
        SIZE_PRESETS[0]
      return json({
        ...session,
        activity: work?.phase ?? null,
        activeFrame: work?.frameIndex ?? null,
        imageSize: { width, height },
      })
    }],

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
            await runChainFrame(frameDeps(session), session, scenario, action, send, signal, render)
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

    [
      'PUT',
      new URLPattern({ pathname: '/api/sessions/:id/frames/:index' }),
      (req, p) =>
        locked(p.id!, 'edit', async (session) => {
          if (!needsStoryboard(session)) return error('Only a Storyboard edits Frames by hand', 409)
          const index = frameIndexOf(session, p.index)
          if (index instanceof Response) return index
          const body = await readJson(req) as { body?: unknown } | undefined
          if (typeof body?.body !== 'string') return error('body is required', 400)
          return json(await setFrameBody({ store: deps.sessions }, session, index, body.body))
        }),
    ],

    [
      'PUT',
      new URLPattern({ pathname: '/api/sessions/:id/look' }),
      (req, p) =>
        locked(p.id!, 'edit', async (session) => {
          if (!needsStoryboard(session) || !session.look) {
            return error('Only a planned Storyboard has a Look', 409)
          }
          const body = await readJson(req) as { subject?: unknown; style?: unknown } | undefined
          if (typeof body?.subject !== 'string' || typeof body?.style !== 'string') {
            return error('subject and style are required', 400)
          }
          return json(
            await setLook({ store: deps.sessions }, session, {
              subject: body.subject,
              style: body.style,
            }),
          )
        }),
    ],

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
