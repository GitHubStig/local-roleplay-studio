import { extname, join } from '@std/path'
import type { ImageGenerator } from './imageGenerator.ts'
import { IMAGE_MODELS } from './imageModels.ts'
import { type ScenarioLibrary, summarise } from './scenario.ts'
import type { Session, SessionStore } from './session.ts'
import { type SettingsStore, SIZE_PRESETS, validateSettings } from './settings.ts'
import type { TextModel } from './textModel.ts'
import { RenderQueue } from './renderQueue.ts'
import { runTurn, type TurnEvent, UndoError, undoLatestTurn } from './turns.ts'

export interface AppDeps {
  settings: SettingsStore
  listTextModels: () => Promise<string[]>
  scenarios: ScenarioLibrary
  sessions: SessionStore
  textModel: (model: string) => TextModel
  imageGenerator: ImageGenerator
  newSessionId?: () => string
  randomSeed?: () => number
}

type Params = Record<string, string | undefined>
type Route = [
  method: string,
  pattern: URLPattern,
  handle: (req: Request, p: Params) => Promise<Response>,
]

/** Turn images: `turn-3-1a2b3c4d.png`, or `turn-3.png` from Sessions saved before unique names. */
const IMAGE_FILE = /^turn-\d+(-[0-9a-f]{8})?\.(png|svg)$/
const CONTENT_TYPES: Record<string, string> = { '.png': 'image/png', '.svg': 'image/svg+xml' }

const json = (body: unknown, status = 200) => Response.json(body, { status })
const error = (message: string, status: number, extra: object = {}) =>
  json({ error: message, ...extra }, status)

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return undefined
  }
}

function defaultSessionId(): string {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  return `${stamp.slice(0, 8)}-${stamp.slice(8)}-${crypto.randomUUID().slice(0, 4)}`
}

const defaultSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]

export function createHandler(deps: AppDeps): (req: Request) => Promise<Response> {
  const newSessionId = deps.newSessionId ?? defaultSessionId
  const randomSeed = deps.randomSeed ?? defaultSeed
  /** The Turn in progress per Session (at most one each) and the step it has reached. */
  const activeTurns = new Map<
    string,
    { controller: AbortController; phase: 'text' | 'queued' | 'image' }
  >()
  /** One image render at a time, across all Sessions. */
  const renderQueue = new RenderQueue()

  async function loadSession(id: string): Promise<Session | Response> {
    return (await deps.sessions.load(id)) ?? error('Session not found', 404)
  }

  const routes: Route[] = [
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
      let textModels: string[] = []
      let textModelsError: string | undefined
      try {
        textModels = await deps.listTextModels()
      } catch (err) {
        textModelsError = `Could not reach Ollama: ${(err as Error).message}`
      }
      return json({
        textModels,
        textModelsError,
        imageModels: IMAGE_MODELS.map(({ id, label, defaultSteps }) => ({
          id,
          label,
          defaultSteps,
        })),
        sizePresets: SIZE_PRESETS,
      })
    }],

    ['GET', new URLPattern({ pathname: '/api/scenarios' }), async () => {
      const { scenarios, errors } = await deps.scenarios.list()
      return json({ scenarios: scenarios.map(summarise), errors })
    }],

    ['POST', new URLPattern({ pathname: '/api/sessions' }), async (req) => {
      const body = await readJson(req) as { scenarioId?: unknown } | undefined
      if (typeof body?.scenarioId !== 'string') return error('scenarioId is required', 400)
      if (!(await deps.scenarios.get(body.scenarioId))) return error('Scenario not found', 404)
      const settings = await deps.settings.load()
      if (!settings.textModel) return error('Choose a Text Model in Settings first', 400)
      const session: Session = {
        id: newSessionId(),
        scenarioId: body.scenarioId,
        settings,
        seed: settings.seedMode === 'fixed' ? settings.seed : randomSeed(),
        createdAt: new Date().toISOString(),
        turns: [],
      }
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
        const latest = s.turns.at(-1)
        return {
          id: s.id,
          scenarioId: s.scenarioId,
          scenarioTitle: titles.get(s.scenarioId) ?? s.scenarioId,
          turns: s.turns.length,
          latestImage: latest?.image ?? null,
          createdAt: s.createdAt,
          updatedAt: latest?.createdAt ?? s.createdAt,
          activity: activeTurns.get(s.id)?.phase ?? null,
        }
      })
      summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      return json(summaries)
    }],

    ['DELETE', new URLPattern({ pathname: '/api/sessions/:id' }), async (_req, p) => {
      const session = await loadSession(p.id!)
      if (session instanceof Response) return session
      if (activeTurns.has(session.id)) return error('Cancel the Turn in progress first', 409)
      await deps.sessions.remove(session.id)
      return new Response(null, { status: 204 })
    }],

    ['GET', new URLPattern({ pathname: '/api/sessions/:id' }), async (_req, p) => {
      const session = await deps.sessions.load(p.id!)
      return session ? json(session) : error('Session not found', 404)
    }],

    ['POST', new URLPattern({ pathname: '/api/sessions/:id/turns' }), async (req, p) => {
      const session = await loadSession(p.id!)
      if (session instanceof Response) return session
      if (activeTurns.has(session.id)) return error('A Turn is already in progress', 409)

      const body = await readJson(req) as { action?: unknown } | undefined
      const opening = session.turns.length === 0
      let action: string | null = null
      if (!opening) {
        if (typeof body?.action !== 'string' || !body.action.trim()) {
          return error('action is required', 400)
        }
        action = body.action.trim()
      }
      const scenario = await deps.scenarios.get(session.scenarioId)
      if (!scenario) return error(`Scenario "${session.scenarioId}" no longer exists`, 409)

      const controller = new AbortController()
      const active = { controller, phase: 'text' as 'text' | 'queued' | 'image' }
      activeTurns.set(session.id, active)
      const encoder = new TextEncoder()

      const stream = new ReadableStream<Uint8Array>({
        async start(sink) {
          const send = (event: string, data: unknown) => {
            try {
              sink.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
            } catch {
              // Client already gone; the Turn is being aborted.
            }
          }
          try {
            await runTurn(
              {
                store: deps.sessions,
                textModel: deps.textModel(session.settings.textModel),
                imageGenerator: deps.imageGenerator,
                renderQueue,
              },
              session,
              scenario,
              action,
              (e: TurnEvent) => {
                if (e.type === 'phase') active.phase = e.phase
                send(e.type, e)
              },
              controller.signal,
            )
          } catch (err) {
            // A Session whose Opening Turn never committed never started.
            if (opening) await deps.sessions.remove(session.id)
            const sessionDiscarded = opening
            if (controller.signal.aborted) {
              send('cancelled', { type: 'cancelled', sessionDiscarded })
            } else {
              send('failed', { type: 'failed', message: (err as Error).message, sessionDiscarded })
            }
          } finally {
            activeTurns.delete(session.id)
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

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      })
    }],

    ['POST', new URLPattern({ pathname: '/api/sessions/:id/cancel' }), (_req, p) => {
      activeTurns.get(p.id!)?.controller.abort(new Error('Cancelled by player'))
      return Promise.resolve(new Response(null, { status: 204 }))
    }],

    ['DELETE', new URLPattern({ pathname: '/api/sessions/:id/turns/:index' }), async (_req, p) => {
      const session = await loadSession(p.id!)
      if (session instanceof Response) return session
      if (activeTurns.has(session.id)) return error('Cancel the Turn in progress first', 409)
      const index = Number(p.index)
      if (!Number.isInteger(index)) return error('Turn index must be a number', 400)
      try {
        return json(await undoLatestTurn(deps.sessions, session, index))
      } catch (err) {
        if (err instanceof UndoError) return error(err.message, 409)
        throw err
      }
    }],

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
    for (const [method, pattern, handle] of routes) {
      if (req.method !== method) continue
      const match = pattern.exec(req.url)
      if (match) return await handle(req, match.pathname.groups)
    }
    return error('Not found', 404)
  }
}
