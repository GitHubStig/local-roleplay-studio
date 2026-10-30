/**
 * What the API's tests share (`app_test.ts`, and each part's `api_test.ts`, `routes_test.ts` and
 * `jobs_test.ts`): the app over fakes, and readers for what it answers.
 */
import { type AppDeps, createHandler } from './app.ts'
import type { ImageGenerator } from './images/imageGenerator.ts'
import { dirSessionStore } from './session.ts'
import type { Picture } from './pictures.ts'
import { DEFAULT_SETTINGS, type Settings, type SettingsStore } from './settings.ts'
import type { TextModel } from './textModel.ts'
import type { RoleplayModel } from './roleplay/model.ts'
import type { FigureMaker } from './3d/figure.ts'
import type { VideoGenerator } from './video/videoGenerator.ts'
import type { SceneMaker } from './3d/scene.ts'
import type { Availabilities } from './features.ts'
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
  video?: VideoGenerator
  settings?: Partial<Settings>
  /** What this "machine" can run; left out, whatever backends are given. */
  features?: Availabilities
  exports?: AppDeps['exports']
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
    scenarios: scenarioLibrary,
    sessions,
    textModel: () => opts.textModel ?? scriptedTextModel([]),
    imageGenerator: opts.imageGenerator ?? fakeImageGenerator(),
    roleplayModel: ({ model }) =>
      opts.roleplayModels?.[model] ?? opts.roleplayModel ?? scriptedRoleplayModel({}),
    voice: opts.voice,
    scene: opts.scene,
    figure: opts.figure,
    lito: opts.lito,
    video: opts.video,
    features: opts.features,
    exports: opts.exports,
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

/** A Frame as the API sends it. */
export type JsonFrame = { pictures: Picture[] } & Record<string, unknown>

/**
 * A Frame with the picture it shows spread onto it (`image` null for none): its latest, as these
 * tests keep to one Image Model unless they switch. Loose, as the API's JSON is.
 */
// deno-lint-ignore no-explicit-any
export const shown = (frame: JsonFrame): any => ({
  ...frame,
  image: null,
  ...frame.pictures.at(-1),
})

/** A Chain with an Opening Frame and a second Frame, and a reply left for a third. */
export async function chainOfTwo(root: string, opts: Partial<Parameters<typeof setup>[0]> = {}) {
  const app = setup({
    root,
    settings: { textModel: 'x' },
    textModel: scriptedTextModel([reply('standing'), reply('sitting'), reply('kneeling')]),
    ...opts,
  })
  await app.call('POST', '/api/sessions', { scenarioId: 'test' })
  await readEvents(await app.call('POST', '/api/sessions/s1/frames', {}))
  await readEvents(await app.call('POST', '/api/sessions/s1/frames', { action: 'Sit' }))
  return app
}

/** A Chain's Frames as saved now. */
export const chainFrames = async (call: ReturnType<typeof setup>['call']) =>
  ((await (await call('GET', '/api/sessions/s1')).json()).frames as JsonFrame[]).map(shown)

/** A Storyboard's Frames as saved now. */
export async function storyboardFrames(call: ReturnType<typeof setup>['call'], id = 's1') {
  return ((await (await call('GET', `/api/sessions/${id}`)).json()).frames as JsonFrame[]).map(
    shown,
  )
}

/**
 * Waits until a Session's queue has no queued or running jobs, and returns what's left: the failed
 * ones. (Done jobs stay listed until dismissed.)
 */
export async function settled(call: ReturnType<typeof setup>['call'], id = 's1') {
  for (let i = 0; i < 200; i++) {
    const jobs = await (await call('GET', `/api/sessions/${id}/jobs`)).json()
    if (!jobs.some((j: { status: string }) => j.status === 'queued' || j.status === 'running')) {
      return jobs.filter((j: { status: string }) => j.status !== 'done')
    }
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('jobs never settled')
}
