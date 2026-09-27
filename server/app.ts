import { extname, join } from '@std/path'
import { error, json, readJson, type Route } from './http.ts'
import type { ImageGenerator } from './imageGenerator.ts'
import { IMAGE_MODELS, UPSCALERS } from './imageModels.ts'
import { crossedLimit, setLimitsEnabled } from './limits.ts'
import type { TextModelInfo } from './ollama.ts'
import { briefScenario, type Scenario, type ScenarioLibrary, summarise } from './scenario.ts'
import type { ChainSession, Session, SessionStore, StoryboardSession } from './session.ts'
import { type SettingsStore, SIZE_PRESETS, validateSettings } from './settings.ts'
import type { TextModel } from './textModel.ts'
import { ollamaRoleplayModel, type RoleplayModel } from './roleplay/model.ts'
import { roleplayExcerpt } from './roleplay/prompt.ts'
import { roleplayRoutes } from './roleplay/routes.ts'
import { RenderQueue } from './renderQueue.ts'
import {
  type FrameDeps,
  runChainFrame,
  UndoError,
  undoLatestFrame,
  UpscaleError,
  upscaleFrame,
} from './frames.ts'
import {
  editFrameByAction,
  LimitError,
  planStoryboard,
  renderStoryboardFrame,
  setFrameBody,
  setLook,
} from './storyboard.ts'

export interface AppDeps {
  settings: SettingsStore
  listTextModels: () => Promise<TextModelInfo[]>
  scenarios: ScenarioLibrary
  sessions: SessionStore
  textModel: (model: string, thinking: boolean) => TextModel
  imageGenerator: ImageGenerator
  /** The Text Model as a Roleplay uses it; Ollama unless a test supplies one. */
  roleplayModel?: (model: string, thinking: boolean) => RoleplayModel
  newSessionId?: () => string
  randomSeed?: () => number
}

/**
 * Frame images: `frame-3-1a2b3c4d.png`, or `frame-3.png` without the unique suffix; `-2048` marks
 * an upscaled one.
 */
const IMAGE_FILE = /^frame-\d+(-[0-9a-f]{8})?(-2048)?\.(png|svg)$/
const CONTENT_TYPES: Record<string, string> = { '.png': 'image/png', '.svg': 'image/svg+xml' }

/** Storyboards plan between 1 and 16 Frames; 8 unless asked otherwise. */
const FRAME_COUNT = { min: 1, max: 16, default: 8 }
const MAX_BRIEF_LENGTH = 4000

function defaultSessionId(): string {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  return `${stamp.slice(0, 8)}-${stamp.slice(8)}-${crypto.randomUUID().slice(0, 4)}`
}

const defaultSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]

type Phase = 'text' | 'queued' | 'image'
type LockKind = 'frame' | 'undo' | 'delete' | 'plan' | 'render' | 'edit' | 'upscale' | 'setup'

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
  const renderQueue = new RenderQueue()

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

  const frameDeps = (session: Session): FrameDeps => ({
    store: deps.sessions,
    textModel: deps.textModel(session.settings.textModel, session.settings.thinking ?? false),
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
    run: (send: (event: { type: string }) => void, signal: AbortSignal) => Promise<void>,
  ): Response {
    const controller = new AbortController()
    const work = { controller, phase: 'text' as Phase, frameIndex }
    active.set(session.id, work)
    const encoder = new TextEncoder()

    const body = new ReadableStream<Uint8Array>({
      async start(sink) {
        const send = (event: { type: string; phase?: Phase }) => {
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
          if (controller.signal.aborted) send({ type: 'cancelled', sessionDiscarded } as never)
          else {
            send({ type: 'failed', message: (err as Error).message, sessionDiscarded } as never)
          }
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

  const roleplayModel = deps.roleplayModel ??
    ((model, thinking) => ollamaRoleplayModel(model, { think: thinking }))

  const routes: Route[] = [
    ...roleplayRoutes({
      locked,
      stream,
      scenarioFor,
      deps: (session) => ({
        store: deps.sessions,
        imageGenerator: deps.imageGenerator,
        renderQueue,
        textModel: deps.textModel(session.settings.textModel, session.settings.thinking ?? false),
        roleplayModel: roleplayModel(
          session.settings.textModel,
          session.settings.thinking ?? false,
        ),
      }),
    }),

    ['GET', new URLPattern({ pathname: '/api/health' }), () => Promise.resolve(json({ ok: true }))],

    [
      'GET',
      new URLPattern({ pathname: '/api/settings' }),
      async () => json(await deps.settings.load()),
    ],

    ['PUT', new URLPattern({ pathname: '/api/settings' }), async (req) => {
      const body = await readJson(req)
      if (body === undefined) return error('Body must be JSON', 400)
      const result = validateSettings(body)
      if (!result.ok) return error('Invalid settings', 400, { issues: result.issues })
      await deps.settings.save(result.settings)
      return json(result.settings)
    }],

    ['GET', new URLPattern({ pathname: '/api/settings/options' }), async () => {
      let models: TextModelInfo[] = []
      let textModelsError: string | undefined
      try {
        models = await deps.listTextModels()
      } catch (err) {
        textModelsError = `Could not reach Ollama: ${(err as Error).message}`
      }
      return json({
        textModels: models.map((m) => m.name),
        thinkingModels: models.filter((m) => m.thinking).map((m) => m.name),
        textModelsError,
        imageModels: IMAGE_MODELS.map(({ id, label, defaultSteps }) => ({
          id,
          label,
          defaultSteps,
        })),
        sizePresets: SIZE_PRESETS,
        upscalers: UPSCALERS,
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
      const session: Session = kind === 'chain'
        ? { ...base, kind, frames: [] }
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
          activity: active.get(s.id)?.phase ?? null,
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
          await deps.sessions.remove(session.id)
          return new Response(null, { status: 204 })
        }),
    ],

    ['GET', new URLPattern({ pathname: '/api/sessions/:id' }), async (_req, p) => {
      const session = await deps.sessions.load(p.id!)
      if (!session) return error('Session not found', 404)
      // `activity` lets a screen that didn't start the running work (another tab) show it.
      const work = active.get(session.id)
      return json({
        ...session,
        activity: work?.phase ?? null,
        activeFrame: work?.frameIndex ?? null,
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
            await runChainFrame(frameDeps(session), session, scenario, action, send, signal)
          })
        }),
    ],

    ['DELETE', new URLPattern({ pathname: '/api/sessions/:id/frames/:index' }), (_req, p) => {
      const index = Number(p.index)
      if (!Number.isInteger(index)) {
        return Promise.resolve(error('Frame index must be a number', 400))
      }
      return locked(p.id!, 'undo', async (session) => {
        if (!needsChain(session)) return error('Only a Chain has Undo', 409)
        return json(await undoLatestFrame(deps.sessions, session, index))
      })
    }],

    [
      'POST',
      new URLPattern({ pathname: '/api/sessions/:id/frames/:index/upscale' }),
      (_req, p) =>
        locked(p.id!, 'upscale', async (session) => {
          const index = frameIndexOf(session, p.index)
          if (index instanceof Response) return index
          const frame = session.frames[index]
          if (!frame.image) return error(`Frame ${index + 1} has no image to upscale`, 409)
          if (frame.upscaled) return error(`Frame ${index + 1} is already upscaled`, 409)
          // The current Settings, not the Session's copy: the upscaler doesn't change the Frames.
          const { upscaler } = await deps.settings.load()
          return stream(session, index, false, async (send, signal) => {
            await upscaleFrame(frameDeps(session), session, index, upscaler, send, signal)
          })
        }),
    ],

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
      new URLPattern({ pathname: '/api/sessions/:id/frames/:index/render' }),
      (_req, p) =>
        locked(p.id!, 'render', async (session) => {
          if (!needsStoryboard(session)) {
            return error('Only a Storyboard renders Frames on demand', 409)
          }
          const index = frameIndexOf(session, p.index)
          if (index instanceof Response) {
            return index
          }
          const blocked = session.frames[index].blocked
          if (blocked) return error(`Frame ${index + 1} crosses a limit: ${blocked}`, 422)
          return stream(session, index, false, async (send, signal) => {
            await renderStoryboardFrame(frameDeps(session), session, index, send, signal)
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
            send({ type: 'edited', ...result } as never)
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
      if (!IMAGE_FILE.test(p.file!)) return error('Not found', 404)
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
