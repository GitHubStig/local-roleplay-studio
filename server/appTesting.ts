/**
 * What the API's tests share (`app_test.ts`, and each part's `api_test.ts`, `routes_test.ts` and
 * `jobs_test.ts`): the app over fakes, and readers for what it answers.
 */
import { type AppDeps, createHandler } from './app.ts'
import type { ImageGenerator } from './images/imageGenerator.ts'
import { dirSessionStore } from './session.ts'
import type { Picture } from '../shared/pictures.ts'
import type { Session } from '../shared/session.ts'
import type {
  ClipPromptEvent,
  EndEvent,
  FrameEvent,
  RoleplayEvent,
  StoryboardEvent,
} from '../shared/events.ts'
import { DEFAULT_SETTINGS, type SettingsStore } from './settings.ts'
import type { Settings } from '../shared/settings.ts'
import type { TextModel } from './textModel.ts'
import type { RoleplayModel } from './roleplay/model.ts'
import type { FigureMaker } from './3d/figure.ts'
import type { StyleEmbedder } from './style/embedder.ts'
import type { VideoGenerator } from './video/videoGenerator.ts'
import type { MusicGenerator } from './music/musicGenerator.ts'
import type { SceneMaker } from './3d/scene.ts'
import type { Availabilities } from '../shared/features.ts'
import type { VoiceEngine } from './voice/voice.ts'
import { scriptedRoleplayModel } from './roleplay/testing.ts'
import { fakeImageGenerator, reply, scenarioLibrary, scriptedTextModel } from './testing.ts'

/** Settings kept in memory, as the server keeps them in a file. */
function memoryStore(initial: Settings = { ...DEFAULT_SETTINGS }): SettingsStore & {
  current: Settings
  apiKeys: Record<string, string>
} {
  const store = {
    current: initial,
    apiKeys: {} as Record<string, string>,
    load: () => Promise.resolve(store.current),
    save: (s: Settings) => {
      store.current = s
      return Promise.resolve()
    },
    loadApiKey: (backend: string) => Promise.resolve(store.apiKeys[backend] ?? ''),
    saveApiKey: (backend: string, key: string) => {
      store.apiKeys[backend] = key
      return Promise.resolve()
    },
  }
  return store
}

export interface SetupOptions {
  root?: string
  listTextModels?: AppDeps['listTextModels']
  scenarios?: AppDeps['scenarios']
  ownScenarios?: AppDeps['ownScenarios']
  comfyuiStatus?: AppDeps['comfyuiStatus']
  textModel?: TextModel
  imageGenerator?: ImageGenerator
  roleplayModel?: RoleplayModel
  /** Roleplay models by model name, e.g. a separate Art Agent's. */
  roleplayModels?: Record<string, RoleplayModel>
  voice?: VoiceEngine
  scene?: SceneMaker
  figure?: FigureMaker
  lito?: FigureMaker
  style?: StyleEmbedder
  video?: VideoGenerator
  music?: MusicGenerator
  settings?: Partial<Settings>
  /** What this "machine" can run; left out, whatever backends are given. */
  features?: Availabilities
  exports?: AppDeps['exports']
  web?: AppDeps['web']
}

/** The app's handler over fakes, Sessions under `root`, and a `call` that sends it a request. */
export function setup(opts: SetupOptions = {}) {
  let sessionCount = 0
  const settings = memoryStore({ ...DEFAULT_SETTINGS, ...opts.settings })
  const sessions = dirSessionStore(opts.root ?? '/nonexistent')
  const handler = createHandler({
    settings,
    comfyuiStatus: opts.comfyuiStatus,
    listTextModels: opts.listTextModels ??
      (() =>
        Promise.resolve([
          { name: 'llama3:latest', thinking: false },
          { name: 'qwen3.8:27b-mlx', thinking: true },
        ])),
    scenarios: opts.scenarios ?? scenarioLibrary,
    ownScenarios: opts.ownScenarios,
    sessions,
    textModel: () => opts.textModel ?? scriptedTextModel([]),
    imageGenerator: opts.imageGenerator ?? fakeImageGenerator(),
    roleplayModel: ({ model }) =>
      opts.roleplayModels?.[model] ?? opts.roleplayModel ?? scriptedRoleplayModel({}),
    voice: opts.voice,
    scene: opts.scene,
    figure: opts.figure,
    lito: opts.lito,
    style: opts.style,
    video: opts.video,
    music: opts.music,
    features: opts.features,
    exports: opts.exports,
    web: opts.web,
    newSessionId: () => `s${++sessionCount}`,
    randomSeed: () => 1234,
  })
  const call = (method: string, path: string, body?: unknown) =>
    handler(
      new Request(`http://localhost${path}`, {
        method,
        // As the web app sends them; a POST without it is refused.
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined
          ? undefined
          : typeof body === 'string'
          ? body
          : JSON.stringify(body),
      }),
    )
  return { settings, sessions, handler, call }
}

/** Reads a whole SSE response into `[event, data]` pairs. */
export async function readEvents(res: Response): Promise<[string, Record<string, unknown>][]> {
  const text = await res.text()
  return text.trim().split('\n\n').filter(Boolean).map((block) => {
    const event = block.match(/^event: (.+)$/m)![1]
    const data = JSON.parse(block.match(/^data: (.+)$/m)![1])
    return [event, data]
  })
}

/** Any event a stream sends, as `shared/events.ts` declares it. */
export type AnyEvent = FrameEvent | StoryboardEvent | RoleplayEvent | ClipPromptEvent | EndEvent

/**
 * The last event of `type` among those a stream sent (`readEvents`), typed as it's declared, so
 * what a test reads of it (a Frame, a Session) is type-checked; throws if there's none.
 */
export function eventOf<T extends AnyEvent['type']>(
  events: [string, Record<string, unknown>][],
  type: T,
): Extract<AnyEvent, { type: T }> {
  const found = events.findLast(([name]) => name === type)
  if (!found) throw new Error(`No ${type} event among ${events.map(([name]) => name).join(', ')}`)
  return found[1] as Extract<AnyEvent, { type: T }>
}

/** Reads SSE text from a stream until `marker` appears; returns everything read so far. */
export async function readUntil(reader: ReadableStreamDefaultReader<string>, marker: string) {
  let seen = ''
  while (!seen.includes(marker)) {
    const r = await reader.read()
    if (r.done) throw new Error(`stream ended before ${marker}; got: ${seen}`)
    seen += r.value
  }
  return seen
}

/** A Session of one kind. */
export type SessionOf<K extends Session['kind']> = Extract<Session, { kind: K }>

/**
 * The Session a response answers with, typed as `shared/` declares it: the one place these tests
 * take the API's JSON on trust, so every read after it is type-checked, and a field renamed in
 * `shared/` fails `deno task check` here rather than only when the test runs (or never, comparing
 * `undefined` with `undefined`). What the server adds as it sends one (its `activity`) isn't read.
 */
export async function sessionFrom(res: Response): Promise<Session> {
  if (!res.ok) throw new Error(`${res.status} ${res.url}: ${await res.text()}`)
  return await res.json() as Session
}

/** `session` as the kind it must be; throws if it's another. */
export function ofKind<K extends Session['kind']>(session: Session, kind: K): SessionOf<K> {
  if (session.kind !== kind) throw new Error(`${session.id} is a ${session.kind}, not a ${kind}`)
  return session as SessionOf<K>
}

/** A Session as saved now, of the kind it must be. */
export const getSession = async <K extends Session['kind']>(
  call: ReturnType<typeof setup>['call'],
  kind: K,
  id = 's1',
) => ofKind(await sessionFrom(await call('GET', `/api/sessions/${id}`)), kind)

/** The picture a Frame shows in these tests, which keep to one Image Model unless they switch. */
export const latestPicture = (frame: { pictures: Picture[] }): Picture | undefined =>
  frame.pictures.at(-1)

/** The same, for a Frame a test has pictured: throws if it has none. */
export function pictureOf(frame: { index: number; pictures: Picture[] }): Picture {
  const picture = latestPicture(frame)
  if (!picture) throw new Error(`Frame ${frame.index + 1} has no picture`)
  return picture
}

/** A Chain with an Opening Frame and a second Frame, and a reply left for a third. */
export async function chainOfTwo(root: string, opts: Partial<Parameters<typeof setup>[0]> = {}) {
  const app = setup({
    root,
    settings: { textModel: 'x' },
    textModel: scriptedTextModel([reply('standing'), reply('sitting'), reply('kneeling')]),
    ...opts,
  })
  await app.call('POST', '/api/sessions', { scenarioId: 'test' })
  await madeFrame(app.call)
  await madeFrame(app.call, 'Sit')
  return app
}

/**
 * Makes a Chain Frame (the Opening without an `action`) and waits for its render job (ADR 0030),
 * dismissed once done so the queue is as before; returns the Frame's events.
 */
export async function madeFrame(
  call: ReturnType<typeof setup>['call'],
  action?: string,
  id = 's1',
) {
  const events = await readEvents(
    await call('POST', `/api/sessions/${id}/frames`, action === undefined ? {} : { action }),
  )
  await settled(call, id)
  await call('DELETE', `/api/sessions/${id}/jobs/finished`)
  return events
}

/** A Chain's Frames as saved now. */
export const chainFrames = async (call: ReturnType<typeof setup>['call']) =>
  (await getSession(call, 'chain')).frames

/** A Storyboard's Frames as saved now. */
export const storyboardFrames = async (call: ReturnType<typeof setup>['call'], id = 's1') =>
  (await getSession(call, 'storyboard', id)).frames

/**
 * Waits until a Session's queue has no queued or running jobs, and returns what's left: the failed
 * ones. (Done jobs stay listed until dismissed.)
 */
export async function settled(call: ReturnType<typeof setup>['call'], id = 's1') {
  for (let i = 0; i < 200; i++) {
    const res = await call('GET', `/api/sessions/${id}/jobs`)
    const jobs = await res.json()
    if (!Array.isArray(jobs)) {
      throw new Error(`The jobs list: ${res.status} ${JSON.stringify(jobs)}`)
    }
    if (!jobs.some((j: { status: string }) => j.status === 'queued' || j.status === 'running')) {
      return jobs.filter((j: { status: string }) => j.status !== 'done')
    }
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('jobs never settled')
}
