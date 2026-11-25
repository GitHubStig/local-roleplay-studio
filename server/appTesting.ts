/**
 * What the API's tests share (`app_test.ts`, and each part's `api_test.ts`, `routes_test.ts` and
 * `jobs_test.ts`): the app over fakes, and readers for what it answers.
 */
import { type AppDeps, createHandler } from './app.ts'
import type { ImageGenerator } from './images/imageGenerator.ts'
import { dirSessionStore } from './session.ts'
import type { Picture } from '../shared/pictures.ts'
import type { Health, Loaded, Session, SessionSummary } from '../shared/session.ts'
import type { SessionContents, SessionSizes } from '../shared/sessionContents.ts'
import type { ClonedSession, ImportedSession } from '../shared/sessionZip.ts'
import type { KeepOptions, KeepPreview, Removed } from '../shared/keep.ts'
import type { ErrorBody } from '../shared/errors.ts'
import type { Job, Queue } from '../shared/jobs.ts'
import type { Expansion, Scenario, ScenarioList, Suggested } from '../shared/scenario.ts'
import type { SentSettings, SettingsOptions, TextModelList } from '../shared/settings.ts'
import type { FolderCheck, PickedFolder, SessionsFolderInfo } from '../shared/sessionsFolder.ts'
import type { PicturesDeleted } from '../shared/pictures.ts'
import type { ComfyStatus } from '../shared/comfyui.ts'
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
  openFolder?: AppDeps['openFolder']
  /**
   * Bytes free where an import goes; left out, unknown (null), so no test asks the OS, which
   * starts PowerShell on Windows, slow when tests run in parallel. `freeSpace_test.ts` asks it.
   */
  freeSpace?: AppDeps['freeSpace']
  /** The address requests come from; left out, none is known, as from nowhere on this machine. */
  client?: string
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
    openFolder: opts.openFolder,
    freeSpace: opts.freeSpace ?? (() => Promise.resolve(null)),
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
      opts.client
        ? { remoteAddr: { transport: 'tcp', hostname: opts.client, port: 50000 } }
        : undefined,
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

/**
 * A response's JSON as `shared/` declares it for its route; fails the test on a refusal. Used only
 * by the readers below, one per route, so each route's type is named in one place.
 */
async function bodyOf<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.url}: ${await res.text()}`)
  return await res.json() as T
}

type Call = ReturnType<typeof setup>['call']

/** A refusal's body: why (and Settings' issues); fails the test if the request wasn't refused. */
export async function refusalIn(res: Response): Promise<ErrorBody> {
  if (res.ok) throw new Error(`${res.status} ${res.url} wasn't refused: ${await res.text()}`)
  return await res.json() as ErrorBody
}

/** A Session's jobs, as listed or as a job queued answers with them. */
export const jobsIn = (res: Response) => bodyOf<Job[]>(res)
export const listJobs = async (call: Call, id = 's1') =>
  jobsIn(await call('GET', `/api/sessions/${id}/jobs`))

/** Home's Sessions, newest first. */
export const listSessions = async (call: Call) =>
  bodyOf<SessionSummary[]>(await call('GET', '/api/sessions'))

/** Every machine's queue, for the queue page. */
export const getQueue = async (call: Call) => bodyOf<Queue>(await call('GET', '/api/queue'))

/** Settings as the server sends them, with the Backends that have an API key saved. */
export const settingsIn = (res: Response) => bodyOf<SentSettings>(res)
export const getSettings = async (call: Call) => settingsIn(await call('GET', '/api/settings'))

/** What Settings and the screens can choose from. */
export const getOptions = async (call: Call) =>
  bodyOf<SettingsOptions>(await call('GET', '/api/settings/options'))

/** A text Backend's models, as listed for Settings. */
export const textModelsIn = (res: Response) => bodyOf<TextModelList>(res)

/** The Scenarios Home lists, and the files that couldn't be read. */
export const listScenarios = async (call: Call) =>
  bodyOf<ScenarioList>(await call('GET', '/api/scenarios'))

/** A Scenario, as read, saved or imported. */
export const scenarioIn = (res: Response) => bodyOf<Scenario>(res)

/** The Sessions folder, and a folder checked to move to. */
export const getSessionsFolder = async (call: Call) =>
  bodyOf<SessionsFolderInfo>(await call('GET', '/api/sessions-folder'))
export const folderCheckIn = (res: Response) => bodyOf<FolderCheck>(res)
export const sessionsFolderIn = (res: Response) => bodyOf<SessionsFolderInfo>(res)

/** Expand's and Suggest's answers, on the Scenario page. */
export const expansionIn = (res: Response) => bodyOf<Expansion>(res)
export const suggestedIn = (res: Response) => bodyOf<Suggested>(res)

/** What a Session holds, and every Session's size, for the Session manager. */
export const getContents = async (call: Call, id = 's1') =>
  bodyOf<SessionContents>(await call('GET', `/api/sessions/${id}/contents`))
export const getSizes = async (call: Call) =>
  bodyOf<SessionSizes>(await call('GET', '/api/session-sizes'))

/** What there is to keep, what a choice keeps, and what Remove the rest left. */
export const keepOptionsIn = (res: Response) => bodyOf<KeepOptions>(res)
export const previewIn = (res: Response) => bodyOf<KeepPreview>(res)
export const removedIn = (res: Response) => bodyOf<Removed>(res)

/** The Session a zip was imported as. */
export const importedIn = (res: Response) => bodyOf<ImportedSession>(res)

/** The Session a clone made. */
export const clonedIn = (res: Response) => bodyOf<ClonedSession>(res)

/** The folder the machine's own dialog picked. */
export const pickedIn = (res: Response) => bodyOf<PickedFolder>(res)

/** A model's pictures deleted from a Session. */
export const deletedIn = (res: Response) => bodyOf<PicturesDeleted>(res)

/** Whether a ComfyUI answers, and what it's missing for what Settings send it. */
export const comfyStatusIn = (res: Response) => bodyOf<ComfyStatus>(res)

/** The server's health check. */
export const healthIn = (res: Response) => bodyOf<Health>(res)

/** `session` as the kind it must be; throws if it's another. */
export function ofKind<K extends Session['kind']>(session: Session, kind: K): SessionOf<K> {
  if (session.kind !== kind) throw new Error(`${session.id} is a ${session.kind}, not a ${kind}`)
  return session as SessionOf<K>
}

/** A Session as saved now, of the kind it must be, with what loading it adds (`Loaded`). */
export const getSession = async <K extends Session['kind']>(
  call: ReturnType<typeof setup>['call'],
  kind: K,
  id = 's1',
): Promise<SessionOf<K> & Loaded> =>
  ofKind(await sessionFrom(await call('GET', `/api/sessions/${id}`)), kind) as SessionOf<K> & Loaded

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
