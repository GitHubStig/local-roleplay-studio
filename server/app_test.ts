import { assertEquals, assertMatch, assertNotEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import { type AppDeps, createHandler } from './app.ts'
import type { TextConnection, TextModelInfo } from './text/backend.ts'
import type { ImageGenerator } from './images/imageGenerator.ts'
import { dirSessionStore } from './session.ts'
import type { Picture } from './pictures.ts'
import { DEFAULT_SETTINGS, type Settings, type SettingsStore } from './settings.ts'
import type { TextModel } from './textModel.ts'
import type { RoleplayModel } from './roleplay/model.ts'
import type { FigureMaker } from './3d/figure.ts'
import type { SceneMaker } from './3d/scene.ts'
import { fakeFigureMaker, fakeSceneMaker } from './3d/testing.ts'
import type { Availabilities } from './features.ts'
import type { VoiceEngine } from './voice/voice.ts'
import { fakeVoiceEngine } from './voice/testing.ts'
import { replyOf, scriptedRoleplayModel, testCast, testLook } from './roleplay/testing.ts'
import {
  fakeImageGenerator,
  planOf,
  promptWith,
  reply,
  scenarioLibrary,
  scriptedTextModel,
  withTempDir,
} from './testing.ts'

function memoryStore(initial: Settings = { ...DEFAULT_SETTINGS }): SettingsStore & {
  current: Settings
  apiKey: string
} {
  const store = {
    current: initial,
    apiKey: '',
    load: () => Promise.resolve(store.current),
    save: (s: Settings) => {
      store.current = s
      return Promise.resolve()
    },
    loadApiKey: () => Promise.resolve(store.apiKey),
    saveApiKey: (key: string) => {
      store.apiKey = key
      return Promise.resolve()
    },
  }
  return store
}

interface SetupOptions {
  root?: string
  listTextModels?: (connection: TextConnection, apiKey?: string) => Promise<TextModelInfo[]>
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
  settings?: Partial<Settings>
  /** What this "machine" can run; left out, whatever backends are given. */
  features?: Availabilities
}

function setup(opts: SetupOptions = {}) {
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
    features: opts.features,
    newSessionId: () => `s${++sessionCount}`,
    randomSeed: () => 1234,
  })
  const call = (method: string, path: string, body?: unknown) =>
    handler(
      new Request(`http://localhost${path}`, {
        method,
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
async function readEvents(res: Response): Promise<[string, Record<string, unknown>][]> {
  const text = await res.text()
  return text.trim().split('\n\n').filter(Boolean).map((block) => {
    const event = block.match(/^event: (.+)$/m)![1]
    const data = JSON.parse(block.match(/^data: (.+)$/m)![1])
    return [event, data]
  })
}

Deno.test('GET /api/health reports ok', async () => {
  const res = await setup().call('GET', '/api/health')
  assertEquals(await res.json(), { ok: true })
})

Deno.test('unknown routes return 404', async () => {
  assertEquals((await setup().call('GET', '/api/nope')).status, 404)
  assertEquals((await setup().call('DELETE', '/api/settings')).status, 404)
})

Deno.test('GET /api/settings returns stored settings', async () => {
  const res = await setup().call('GET', '/api/settings')
  assertEquals(await res.json(), { ...DEFAULT_SETTINGS, textApiKeySet: false })
})

Deno.test('The API key is saved apart from Settings, and never sent back', async () => {
  const { settings, call } = setup()
  const next = {
    ...DEFAULT_SETTINGS,
    textBackend: 'openai',
    textBaseUrl: 'https://openrouter.ai/api/v1',
    textApiKey: ' sk-secret ',
  }
  const saved = await (await call('PUT', '/api/settings', next)).json()
  assertEquals(settings.apiKey, 'sk-secret')
  assertEquals('textApiKey' in settings.current, false)
  assertEquals(saved.textApiKeySet, true)
  assertEquals(JSON.stringify(saved).includes('sk-secret'), false)
  assertEquals(
    JSON.stringify(await (await call('GET', '/api/settings')).json()).includes('sk-secret'),
    false,
  )

  // Left out, the key is kept; '' removes it.
  const { textApiKey: _, ...withoutKey } = next
  await call('PUT', '/api/settings', withoutKey)
  assertEquals(settings.apiKey, 'sk-secret')
  await call('PUT', '/api/settings', { ...withoutKey, textApiKey: '' })
  assertEquals(settings.apiKey, '')
})

Deno.test('An OpenAI-compatible server needs an address', async () => {
  const res = await setup().call('PUT', '/api/settings', {
    ...DEFAULT_SETTINGS,
    textBackend: 'openai',
  })
  assertEquals(res.status, 400)
})

Deno.test('POST /api/settings/text-models lists a backend not saved yet', async () => {
  const asked: [TextConnection, string | undefined][] = []
  const { call } = setup({
    listTextModels: (connection, apiKey) => {
      asked.push([connection, apiKey])
      return Promise.reject(new Error('401 Unauthorized'))
    },
  })
  const body = await (await call('POST', '/api/settings/text-models', {
    textBackend: 'openai',
    textBaseUrl: ' http://localhost:1234/v1 ',
    textApiKey: 'sk-new',
  })).json()
  assertEquals(asked, [[{ backend: 'openai', baseUrl: 'http://localhost:1234/v1' }, 'sk-new']])
  assertEquals(body.textModels, [])
  assertEquals(
    body.textModelsError,
    'Could not reach the OpenAI-compatible server: 401 Unauthorized',
  )
  const bad = await call('POST', '/api/settings/text-models', { textBackend: 'nope' })
  assertEquals(bad.status, 400)
})

Deno.test('PUT /api/settings saves valid settings', async () => {
  const { settings, call } = setup()
  const next = { ...DEFAULT_SETTINGS, textModel: 'llama3:latest', steps: 12, quantize: 8 as const }
  assertEquals((await call('PUT', '/api/settings', next)).status, 200)
  assertEquals(settings.current, next)
})

Deno.test('PUT /api/settings rejects invalid settings without saving', async () => {
  const { settings, call } = setup()
  const res = await call('PUT', '/api/settings', { ...DEFAULT_SETTINGS, imageModel: 'x', steps: 0 })
  assertEquals(res.status, 400)
  assertEquals((await res.json()).issues.length, 2)
  assertEquals(settings.current, DEFAULT_SETTINGS)
})

Deno.test('PUT /api/settings rejects a non-JSON body', async () => {
  assertEquals((await setup().call('PUT', '/api/settings', 'not json')).status, 400)
})

Deno.test('GET /api/settings/options lists Text and Image Models', async () => {
  const body = await (await setup().call('GET', '/api/settings/options')).json()
  assertEquals(body.textModels, ['llama3:latest', 'qwen3.8:27b-mlx'])
  assertEquals(body.thinkingModels, ['qwen3.8:27b-mlx'])
  assertEquals(body.imageModels.mflux[0].id, 'flux2-klein-4b')
  assertEquals(body.imageModels.comfyui.map((m: { id: string }) => m.id), ['qwen-image-2.1'])
})

Deno.test('POST /api/settings/comfyui checks an address not saved yet', async () => {
  const asked: [string, { imageModel?: string; upscaler?: string; voices?: boolean }][] = []
  const { call } = setup({
    comfyuiStatus: (url, uses) => {
      asked.push([url, uses])
      return Promise.resolve({
        up: true,
        version: '0.39.1',
        device: 'cuda:0 NVIDIA GeForce RTX 4070',
        ready: true,
      })
    },
  })
  const res = await call('POST', '/api/settings/comfyui', {
    imageBaseUrl: ' http://192.168.1.20:8188 ',
    imageModel: 'qwen-image-2.1',
  })
  assertEquals((await res.json()).device, 'cuda:0 NVIDIA GeForce RTX 4070')
  // A Mac rendering with mflux checks only the upscaler it sends there.
  await call('POST', '/api/settings/comfyui', {
    imageBaseUrl: 'http://192.168.1.20:8188',
    upscaler: 'seedvr2-7b',
  })
  assertEquals(asked, [
    ['http://192.168.1.20:8188', {
      imageModel: 'qwen-image-2.1',
      upscaler: undefined,
      voices: undefined,
    }],
    ['http://192.168.1.20:8188', {
      imageModel: undefined,
      upscaler: 'seedvr2-7b',
      voices: undefined,
    }],
  ])
})

Deno.test('Choosing ComfyUI makes pictures, and then Upscale, available where mflux is not', async () => {
  const off = { available: false, reason: 'mflux runs only on Apple Silicon Macs' }
  const on = { available: true }
  const { call } = setup({
    features: { images: off, upscale: off, voices: off, scenes: on, figures: on, lito: off },
  })
  const before = (await (await call('GET', '/api/settings/options')).json()).features
  assertEquals(before.images.available, false)
  assertStringIncludes(before.images.reason, 'or choose ComfyUI')
  const settings = await (await call('GET', '/api/settings')).json()
  const saved = await call('PUT', '/api/settings', {
    ...settings,
    imageBackend: 'comfyui',
    imageModel: 'qwen-image-2.1',
  })
  assertEquals(saved.status, 200)
  const after = (await (await call('GET', '/api/settings/options')).json()).features
  // Upscale has its own choice: still mflux, so still off.
  assertEquals([after.images.available, after.upscale.available], [true, false])
  assertStringIncludes(after.upscale.reason, 'or choose ComfyUI for Upscale')
  await call('PUT', '/api/settings', {
    ...settings,
    imageBackend: 'comfyui',
    imageModel: 'qwen-image-2.1',
    upscaleBackend: 'comfyui',
  })
  const both = (await (await call('GET', '/api/settings/options')).json()).features
  assertEquals(both.upscale.available, true)
  // Voices too: off with no voice service here, on once sent to ComfyUI.
  assertStringIncludes(both.voices.reason, 'or choose ComfyUI for Voices')
  await call('PUT', '/api/settings', {
    ...settings,
    imageBackend: 'comfyui',
    imageModel: 'qwen-image-2.1',
    voiceBackend: 'comfyui',
  })
  const voices = (await (await call('GET', '/api/settings/options')).json()).features
  assertEquals(voices.voices.available, true)
  // An Image Model must be the backend's own: FLUX.2 Klein is mflux's only.
  const wrong = await call('PUT', '/api/settings', {
    ...settings,
    imageBackend: 'comfyui',
    imageModel: 'flux2-klein-4b',
  })
  assertEquals(wrong.status, 400)
})

Deno.test('GET /api/settings/options still answers when Ollama is down', async () => {
  const { call } = setup({ listTextModels: () => Promise.reject(new Error('connection refused')) })
  const body = await (await call('GET', '/api/settings/options')).json()
  assertEquals(body.textModels, [])
  assertEquals(body.textModelsError, 'Could not reach Ollama: connection refused')
})

Deno.test('GET /api/scenarios lists summaries and load errors', async () => {
  assertEquals(await (await setup().call('GET', '/api/scenarios')).json(), {
    scenarios: [{ id: 'test', title: 'Test Shoot', description: 'A short test.' }],
    errors: [{ file: 'broken.md', message: 'title must be a non-empty string' }],
  })
})

Deno.test('POST /api/sessions snapshots settings and resolves the seed', () =>
  withTempDir(async (root) => {
    const { call } = setup({ root, settings: { textModel: 'llama3:latest' } })
    const res = await call('POST', '/api/sessions', { scenarioId: 'test' })
    assertEquals(res.status, 201)
    const session = await res.json()
    assertEquals(session.id, 's1')
    assertEquals(session.kind, 'chain')
    assertEquals(session.seed, 1234)
    assertEquals(session.settings.textModel, 'llama3:latest')
    assertEquals(session.frames, [])
  }))

Deno.test('POST /api/sessions uses a fixed seed when set', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x', seedMode: 'fixed', seed: 99 },
    })
    assertEquals(
      (await (await call('POST', '/api/sessions', { scenarioId: 'test' })).json()).seed,
      99,
    )
  }))

Deno.test('POST /api/sessions refuses without a Text Model or a known Scenario', async () => {
  assertEquals((await setup().call('POST', '/api/sessions', { scenarioId: 'test' })).status, 400)
  const { call } = setup({ settings: { textModel: 'x' } })
  assertEquals((await call('POST', '/api/sessions', { scenarioId: 'nope' })).status, 404)
  assertEquals((await call('POST', '/api/sessions', {})).status, 400)
})

Deno.test('Frames stream progress and commit, then serve their image', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })

    const opening = await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    assertEquals(opening.map(([e]) => e), ['phase', 'text', 'phase', 'committed'])

    assertEquals((await call('POST', '/api/sessions/s1/frames', {})).status, 400)
    const second = await readEvents(
      await call('POST', '/api/sessions/s1/frames', { action: 'Sit' }),
    )
    assertEquals(second.at(-1)![1].frame, {
      ...(second.at(-1)![1].frame as object),
      index: 1,
      action: 'Sit',
    })

    const session = await (await call('GET', '/api/sessions/s1')).json()
    const [firstImage, secondImage] = session.frames.map((t: JsonFrame) => shown(t).image)
    assertMatch(firstImage, /^frame-0-[0-9a-f]{8}\.png$/)

    const image = await call('GET', `/api/sessions/s1/images/${secondImage}`)
    assertEquals(image.headers.get('Content-Type'), 'image/png')
    assertEquals(await image.text(), promptWith('sitting'))
    assertEquals((await call('GET', '/api/sessions/s1/images/session.json')).status, 404)
  }))

Deno.test('A failed Opening Frame discards the Session', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing')]),
      imageGenerator: fakeImageGenerator({ fail: true }),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    const events = await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    assertEquals(events.at(-1), [
      'failed',
      { type: 'failed', message: 'mflux crashed', sessionDiscarded: true },
    ])
    assertEquals((await call('GET', '/api/sessions/s1')).status, 404)
  }))

Deno.test('Cancel aborts the Frame in progress and rejects overlapping Frames', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing')]),
      imageGenerator: fakeImageGenerator({ hang: true }),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    const res = await call('POST', '/api/sessions/s1/frames', {})
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
    let seen = ''
    while (!seen.includes('"phase":"image"')) seen += (await reader.read()).value

    assertEquals((await call('POST', '/api/sessions/s1/frames', {})).status, 409)
    assertEquals((await call('POST', '/api/sessions/s1/cancel')).status, 204)

    let rest = ''
    for (let r = await reader.read(); !r.done; r = await reader.read()) rest += r.value
    assertEquals(rest.includes('event: cancelled'), true)
    assertEquals(rest.includes('"sessionDiscarded":true'), true)
  }))

Deno.test('A render in progress serves its latest preview while Settings show it, then none', () =>
  withTempDir(async (root) => {
    const { call, settings } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing')]),
      imageGenerator: fakeImageGenerator({ hang: true }),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    assertEquals((await call('GET', '/api/sessions/s1/preview')).status, 404)
    const res = await call('POST', '/api/sessions/s1/frames', {})
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
    let seen = ''
    while (!seen.includes('"phase":"image"')) seen += (await reader.read()).value

    // The phase comes just before the render starts and sends its first preview.
    let preview = await call('GET', '/api/sessions/s1/preview?step=1')
    while (preview.status === 404) {
      await preview.body?.cancel()
      await new Promise((r) => setTimeout(r, 5))
      preview = await call('GET', '/api/sessions/s1/preview?step=1')
    }
    assertEquals(preview.headers.get('content-type'), 'image/jpeg')
    assertEquals([...new Uint8Array(await preview.arrayBuffer())], [255, 216, 255])
    await settings.save({ ...await settings.load(), previews: false })
    assertEquals((await call('GET', '/api/sessions/s1/preview')).status, 404)
    await settings.save({ ...await settings.load(), previews: true })

    await call('POST', '/api/sessions/s1/cancel')
    for (let r = await reader.read(); !r.done; r = await reader.read());
    assertEquals((await call('GET', '/api/sessions/s1/preview')).status, 404)
  }))

Deno.test('DELETE /api/sessions/:id/frames/:index undoes only the latest Frame', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Sit' }))

    assertEquals((await call('DELETE', '/api/sessions/s1/frames/0')).status, 409)
    assertEquals((await call('DELETE', '/api/sessions/s1/frames/x')).status, 400)
    const res = await call('DELETE', '/api/sessions/s1/frames/1')
    assertEquals(res.status, 200)
    assertEquals((await res.json()).frames.length, 1)
    assertEquals((await call('DELETE', '/api/sessions/s1/frames/1')).status, 409)
    assertEquals((await call('DELETE', '/api/sessions/s1/frames/0')).status, 409)
  }))

Deno.test('Undo is refused while a Frame is in progress', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting')]),
      imageGenerator: fakeImageGenerator({ hang: true }),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    const res = await call('POST', '/api/sessions/s1/frames', {})
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
    let seen = ''
    while (!seen.includes('"phase":"image"')) seen += (await reader.read()).value
    assertEquals((await call('DELETE', '/api/sessions/s1/frames/0')).status, 409)
    await call('POST', '/api/sessions/s1/cancel')
    for (let r = await reader.read(); !r.done; r = await reader.read()) { /* drain */ }
  }))

Deno.test('GET /api/sessions lists Sessions newest first with their activity', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting'), reply('kneeling')]),
    })
    assertEquals(await (await call('GET', '/api/sessions')).json(), [])
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s2/frames', {}))
    // Timestamps have millisecond resolution; make s1's latest Frame clearly the newest.
    await new Promise((r) => setTimeout(r, 5))
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Sit' }))

    const list = await (await call('GET', '/api/sessions')).json()
    assertEquals(list.map((s: { id: string }) => s.id), ['s1', 's2'])
    assertEquals(list[0].title, 'Test Shoot')
    assertEquals(list[0].frames, 2)
    assertMatch(list[0].latestImage, /^frame-1-/)
    assertEquals(list[0].activity, null)
  }))

Deno.test('DELETE /api/sessions/:id removes a Session and its images', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    assertEquals((await call('DELETE', '/api/sessions/s1')).status, 204)
    assertEquals((await call('GET', '/api/sessions/s1')).status, 404)
    assertEquals(await Deno.stat(`${root}/s1`).then(() => true, () => false), false)
    assertEquals((await call('DELETE', '/api/sessions/s1')).status, 404)
  }))

/** Reads SSE text from a stream until `marker` appears; returns everything read so far. */
async function readUntil(reader: ReadableStreamDefaultReader<string>, marker: string) {
  let seen = ''
  while (!seen.includes(marker)) {
    const r = await reader.read()
    if (r.done) throw new Error(`stream ended before ${marker}; got: ${seen}`)
    seen += r.value
  }
  return seen
}

Deno.test('Images render one at a time across Sessions; a waiting Frame is queued', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting')]),
      imageGenerator: fakeImageGenerator({ hang: true }),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    const a = (await call('POST', '/api/sessions/s1/frames', {})).body!
      .pipeThrough(new TextDecoderStream()).getReader()
    await readUntil(a, '"phase":"image"')

    const b = (await call('POST', '/api/sessions/s2/frames', {})).body!
      .pipeThrough(new TextDecoderStream()).getReader()
    await readUntil(b, '"phase":"queued"')
    assertEquals((await (await call('GET', '/api/sessions/s1')).json()).activity, 'image')
    assertEquals((await (await call('GET', '/api/sessions/s2')).json()).activity, 'queued')
    const list = await (await call('GET', '/api/sessions')).json()
    const activity = Object.fromEntries(
      list.map((s: { id: string; activity: string }) => [s.id, s.activity]),
    )
    assertEquals(activity, { s1: 'image', s2: 'queued' })
    assertEquals((await call('DELETE', '/api/sessions/s2')).status, 409)

    // Cancelling A's render lets B's start.
    await call('POST', '/api/sessions/s1/cancel')
    await readUntil(a, 'event: cancelled')
    await readUntil(b, '"phase":"image"')
    await call('POST', '/api/sessions/s2/cancel')
    await readUntil(b, 'event: cancelled')
  }))

Deno.test('Two Frames sent at once for one Session: only one runs', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting'), reply('kneeling')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))

    const [a, b] = await Promise.all([
      call('POST', '/api/sessions/s1/frames', { action: 'Sit' }),
      call('POST', '/api/sessions/s1/frames', { action: 'Kneel' }),
    ])
    assertEquals([a.status, b.status].sort(), [200, 409])
    await readEvents(a.status === 200 ? a : b)
    await (a.status === 200 ? b : a).body?.cancel()

    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(session.frames.map((t: { index: number }) => t.index), [0, 1])
  }))

Deno.test('Undo and a Frame sent at once never bring back the undone Frame', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting'), reply('kneeling')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Sit' }))

    const [undo, frame] = await Promise.all([
      call('DELETE', '/api/sessions/s1/frames/1'),
      call('POST', '/api/sessions/s1/frames', { action: 'Kneel' }),
    ])
    if (frame.status === 200) await readEvents(frame)
    else await frame.body?.cancel()
    assertEquals([undo.status, frame.status].includes(409), true)

    // Whatever won, every Frame is numbered in order and its image exists.
    const session = await (await call('GET', '/api/sessions/s1')).json()
    session.frames.forEach((t: { index: number }, i: number) => assertEquals(t.index, i))
    for (const t of session.frames as JsonFrame[]) {
      assertEquals((await call('GET', `/api/sessions/s1/images/${shown(t).image}`)).status, 200)
    }
  }))

Deno.test('A Session is free again after a Frame, a failed Frame, an early refusal and an Undo', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([
        reply('standing'),
        new Error('bad reply'),
        new Error('bad again'),
        reply('sitting'),
        reply('kneeling'),
      ]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    const failed = await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'A' }))
    assertEquals(failed.at(-1)![0], 'failed')
    assertEquals((await call('POST', '/api/sessions/s1/frames', {})).status, 400)
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Sit' }))
    assertEquals((await call('DELETE', '/api/sessions/s1/frames/1')).status, 200)
    const last = await readEvents(
      await call('POST', '/api/sessions/s1/frames', { action: 'Kneel' }),
    )
    assertEquals(last.at(-1)![0], 'committed')
    assertEquals((await call('DELETE', '/api/sessions/s1')).status, 204)
  }))

// --- Briefs and Storyboards ----------------------------------------------------------------

Deno.test('POST /api/sessions starts from a typed Brief or a Scenario, not both', () =>
  withTempDir(async (root) => {
    const { call } = setup({ root, settings: { textModel: 'x' } })
    const chain = await (await call('POST', '/api/sessions', { brief: 'A knight in fog.' })).json()
    assertEquals([chain.kind, chain.brief, chain.scenarioId], ['chain', 'A knight in fog.', null])
    assertEquals(
      (await call('POST', '/api/sessions', { brief: 'x', scenarioId: 'test' })).status,
      400,
    )
    assertEquals((await call('POST', '/api/sessions', {})).status, 400)
    assertEquals((await call('POST', '/api/sessions', { brief: 'a child on a swing' })).status, 422)
  }))

Deno.test('POST /api/sessions makes a Storyboard with a Frame count', () =>
  withTempDir(async (root) => {
    const { call } = setup({ root, settings: { textModel: 'x' } })
    const board = await (await call('POST', '/api/sessions', {
      kind: 'storyboard',
      brief: 'A dunk.',
      frameCount: 5,
    })).json()
    assertEquals([board.kind, board.frameCount, board.look, board.frames], [
      'storyboard',
      5,
      null,
      [],
    ])
    const byDefault =
      await (await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'x' })).json()
    assertEquals(byDefault.frameCount, 8)
    for (const frameCount of [0, 33, 2.5]) {
      assertEquals(
        (await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'x', frameCount }))
          .status,
        400,
      )
    }
  }))

Deno.test('A Storyboard plans, renders, and is edited by hand and by Action over the API', () =>
  withTempDir(async (root) => {
    const newLook = {
      people: [{ name: 'Ace', identity: 'Ace, a tall adult athlete.' }],
      style: 'Watercolour.',
    }
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([], [], {
        plans: [planOf(3)],
        edits: [{
          outcome: 'done',
          narration: 'Pose: soaring.',
          body: 'He soars.',
          shown: ['Ace'],
          look: planOf(3).look,
        }],
      }),
    })
    await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'A dunk.', frameCount: 3 })

    const plan = await readEvents(await call('POST', '/api/sessions/s1/plan'))
    assertEquals(plan.map(([e]) => e), [
      'phase',
      'look',
      'beats',
      'planned-frame',
      'planned-frame',
      'planned-frame',
      'planned',
    ])
    assertEquals((await call('POST', '/api/sessions/s1/plan')).status, 409)

    const render = await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 2 })
    assertEquals(render.status, 201)
    assertEquals(await settled(call), [])
    assertMatch((await storyboardFrames(call))[2].image!, /^frame-2-[0-9a-f]{8}\.png$/)
    const past = await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 9 })
    assertEquals(past.status, 404)

    const byHand = await (await call('PUT', '/api/sessions/s1/frames/2', { body: 'He lands.' }))
      .json()
    assertEquals([byHand.frames[2].body, shown(byHand.frames[2]).stale], ['He lands.', true])
    assertEquals((await call('PUT', '/api/sessions/s1/frames/0', { body: 'Nude.' })).status, 422)
    const nobody = await call('PUT', '/api/sessions/s1/frames/1', { body: 'A hoop.', shown: [] })
    assertEquals((await nobody.json()).frames[1].shown, [])
    const badShown = await call('PUT', '/api/sessions/s1/frames/1', {
      body: 'A hoop.',
      shown: 'Ace',
    })
    assertEquals(badShown.status, 400)

    const look = await (await call('PUT', '/api/sessions/s1/look', newLook)).json()
    assertEquals(look.look, newLook)
    const oldShape = { subject: 'A man.', style: 'Ink.' }
    assertEquals((await call('PUT', '/api/sessions/s1/look', oldShape)).status, 400)

    const edit = await readEvents(
      await call('POST', '/api/sessions/s1/frames/0/edit', { action: 'soar' }),
    )
    const [, edited] = edit.at(-1)!
    assertEquals([
      edited.type,
      edited.outcome,
      (edited.session as { frames: { body: string }[] }).frames[0].body,
    ], [
      'edited',
      'done',
      'He soars.',
    ])
  }))

Deno.test("Chains and Storyboards refuse each other's routes", () =>
  withTempDir(async (root) => {
    const { call } = setup({ root, settings: { textModel: 'x' } })
    await call('POST', '/api/sessions', { brief: 'A knight.' }) // s1, a Chain
    await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'A dunk.' }) // s2
    assertEquals((await call('POST', '/api/sessions/s1/plan')).status, 409)
    assertEquals(
      (await call('PUT', '/api/sessions/s1/look', { people: [], style: 'b' })).status,
      409,
    )
    assertEquals((await call('POST', '/api/sessions/s2/frames', { action: 'x' })).status, 409)
    assertEquals((await call('DELETE', '/api/sessions/s2/frames/0')).status, 409)
    assertEquals(
      (await call('PUT', '/api/sessions/s2/look', { people: [], style: 'b' })).status,
      409,
    )
  }))

Deno.test('Cancelling a plan discards the Storyboard', () =>
  withTempDir(async (root) => {
    let release!: () => void
    const hanging = scriptedTextModel([], [], {})
    hanging.planStoryboard = (_req, signal) =>
      new Promise((_, reject) => {
        release = () => reject(signal.reason)
        signal.addEventListener('abort', release, { once: true })
      })
    const { call } = setup({ root, settings: { textModel: 'x' }, textModel: hanging })
    await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'A dunk.' })
    const res = await call('POST', '/api/sessions/s1/plan')
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
    await readUntil(reader, '"phase":"text"')
    assertEquals((await (await call('GET', '/api/sessions/s1')).json()).activity, 'text')
    await call('POST', '/api/sessions/s1/cancel')
    const rest = await readUntil(reader, 'event: cancelled')
    assertEquals(rest.includes('"sessionDiscarded":true'), true)
    assertEquals((await call('GET', '/api/sessions/s1')).status, 404)
  }))

/** A Chain with an Opening Frame and a second Frame, and a reply left for a third. */
/** A Frame as the API sends it. */
type JsonFrame = { pictures: Picture[] } & Record<string, unknown>

/**
 * A Frame with the picture it shows spread onto it (`image` null for none): its latest, as these
 * tests keep to one Image Model unless they switch. Loose, as the API's JSON is.
 */
// deno-lint-ignore no-explicit-any
const shown = (frame: JsonFrame): any => ({ ...frame, image: null, ...frame.pictures.at(-1) })

async function chainOfTwo(root: string, opts: Partial<Parameters<typeof setup>[0]> = {}) {
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

const chainFrames = async (call: ReturnType<typeof setup>['call']) =>
  ((await (await call('GET', '/api/sessions/s1')).json()).frames as JsonFrame[]).map(shown)

Deno.test('A Chain queues an upscale of one Frame, once', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = await chainOfTwo(root, { imageGenerator: images })
    const queued = await call('POST', '/api/sessions/s1/jobs', { kind: 'upscale', frameIndex: 1 })
    assertEquals(queued.status, 201)
    assertEquals(await settled(call), [])
    const [opening, second] = await chainFrames(call)
    assertMatch(second.upscaled!, /^frame-1-[0-9a-f]{8}-2048\.png$/)
    assertEquals(opening.upscaled, undefined)
    assertEquals(images.upscaled, [second.image])
    assertEquals((await call('GET', `/api/sessions/s1/images/${second.upscaled}`)).status, 200)
    const again = await call('POST', '/api/sessions/s1/jobs', { kind: 'upscale', frameIndex: 1 })
    assertEquals(again.status, 409)
  }))

Deno.test('A Chain queues SHARP, TripoSplat and LiTo for one Frame', () =>
  withTempDir(async (root) => {
    const scene = fakeSceneMaker(), figure = fakeFigureMaker(), lito = fakeFigureMaker()
    const { call } = await chainOfTwo(root, { scene, figure, lito })
    for (const kind of ['scene', 'figure', 'lito']) {
      assertEquals(
        (await call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 1 })).status,
        201,
      )
    }
    assertEquals(await settled(call), [])
    const [opening, second] = await chainFrames(call)
    assertMatch(second.scene!.file, /^scene-1-[0-9a-f]{8}\.ply$/)
    assertMatch(second.figure!.file, /^figure-1-[0-9a-f]{8}\.ply$/)
    assertMatch(second.lito!.file, /^lito-1-[0-9a-f]{8}\.ply$/)
    assertEquals([opening.scene, opening.figure, opening.lito], [undefined, undefined, undefined])
    assertEquals(second.scene!.from, second.image)
    assertEquals((await call('GET', `/api/sessions/s1/images/${second.lito!.file}`)).status, 200)
    // A Chain has no Roleplay jobs.
    const picture = await call('POST', '/api/sessions/s1/jobs', { kind: 'picture', frameIndex: 0 })
    assertEquals(picture.status, 409)

    // Undoing the Frame deletes them with its picture.
    await call('DELETE', '/api/sessions/s1/frames/1')
    for (
      const file of [second.image!, second.scene!.file, second.figure!.file, second.lito!.file]
    ) {
      assertEquals((await call('GET', `/api/sessions/s1/images/${file}`)).status, 404)
    }
  }))

Deno.test('A Session switches Image Model, and a Chain Frame by the old one renders again', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = await chainOfTwo(root, { imageGenerator: images })
    const switchTo = (imageModel: unknown) =>
      call('PUT', '/api/sessions/s1/image-model', { imageModel })
    const render = () => call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 1 })
    assertEquals((await render()).status, 409)

    assertEquals((await switchTo(42)).status, 400)
    const unknown = await switchTo('dall-e')
    assertEquals([unknown.status, (await unknown.json()).error], [
      400,
      'mflux has no Image Model "dall-e"',
    ])
    assertEquals(
      (await call('PUT', '/api/sessions/nope/image-model', { imageModel: 'x' })).status,
      404,
    )

    const switched = await (await switchTo('flux2-klein-4b')).json()
    assertEquals([switched.settings.imageModel, switched.settings.steps], ['flux2-klein-4b', 4])
    const [, before] = await chainFrames(call)
    assertEquals((await render()).status, 201)
    assertEquals(await settled(call), [])
    const [, after] = await chainFrames(call)
    assertEquals(after.pictures.map((p: Picture) => p.image), [before.image, after.image])
    assertEquals(images.prompts.length, 3)
  }))

Deno.test("A Chain carries on while a job runs, and Undo cancels the undone Frame's jobs", () =>
  withTempDir(async (root) => {
    // LiTo takes until it's let go, or cancelled.
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    const lito = fakeFigureMaker()
    const make = lito.make
    lito.make = async (req, signal, onDownload) => {
      await Promise.race([
        held,
        new Promise((_, no) => signal.addEventListener('abort', () => no(signal.reason))),
      ])
      return make(req, signal, onDownload)
    }
    const { call } = await chainOfTwo(root, { lito })
    await call('POST', '/api/sessions/s1/jobs', { kind: 'lito', frameIndex: 0 })
    // The next Frame isn't held up by the job (its render would wait its turn, so it has none).
    await call('PUT', '/api/sessions/s1/render-frames', { renderFrames: false })
    const next = await readEvents(
      await call('POST', '/api/sessions/s1/frames', { action: 'Kneel' }),
    )
    assertEquals(next.at(-1)![0], 'committed')
    await call('POST', '/api/sessions/s1/jobs', { kind: 'lito', frameIndex: 2 })
    assertEquals((await call('DELETE', '/api/sessions/s1/frames/2')).status, 200)
    release()
    assertEquals(await settled(call), [])
    // Frame 0's figure landed on the Chain as it is now; Frame 2's job went with Frame 2.
    const frames = await chainFrames(call)
    assertEquals(frames.length, 2)
    assertMatch(frames[0].lito!.file, /^lito-0-/)
    assertEquals(lito.made.length, 1)
  }))

Deno.test('A Chain job whose Feature is off is refused, saying why', () =>
  withTempDir(async (root) => {
    const { call, settings } = await chainOfTwo(root, { figure: fakeFigureMaker() })
    const queue = async (kind: string) => {
      const res = await call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 0 })
      return [res.status, (await res.json()).error]
    }
    // Not set up here (on Windows, say).
    assertEquals(await queue('lito'), [409, "LiTo isn't available here: No LiTo was set up"])
    // Set up, but switched off in Settings.
    settings.current = {
      ...settings.current,
      features: { ...settings.current.features, figures: false },
    }
    assertEquals(await queue('figure'), [409, 'TripoSplat is switched off in Settings'])
    assertEquals(await settled(call), [])
  }))

Deno.test('Without pictures every kind starts; a Chain writes its Frames without rendering', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const off = { available: false, reason: 'mflux runs only on Apple Silicon Macs' }
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing')]),
      imageGenerator: images,
      features: { images: off, upscale: off, voices: off, scenes: off, figures: off, lito: off },
    })
    for (const kind of ['chain', 'storyboard', 'roleplay']) {
      const res = await call('POST', '/api/sessions', { kind, brief: 'A rainy street.' })
      assertEquals(res.status, 201)
    }
    const chain = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(chain.renderFrames, false)
    const opening = await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    const frame = opening.at(-1)![1].frame as JsonFrame & { prompt: string }
    assertEquals(frame.pictures, [])
    assertStringIncludes(frame.prompt, 'standing')
    assertEquals(images.prompts.length, 0)
    // Rendering, by the switch or a job, needs pictures.
    const on = await call('PUT', '/api/sessions/s1/render-frames', { renderFrames: true })
    assertEquals(on.status, 409)
    const job = await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 0 })
    assertEquals(job.status, 409)

    // Home shows the Chain's Narration in place of a picture (a Storyboard its first Beat).
    const cards = await (await call('GET', '/api/sessions')).json()
    const chainCard = cards.find((c: { id: string }) => c.id === 's1')
    assertEquals([chainCard.latestImage, chainCard.excerpt], [null, 'Pose: standing.'])
  }))

Deno.test('A Chain with rendering off writes prompts, and renders a Frame when asked', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting'), reply('kneeling')]),
      imageGenerator: images,
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    const off = await call('PUT', '/api/sessions/s1/render-frames', { renderFrames: false })
    assertEquals((await off.json()).renderFrames, false)
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Sit' }))
    assertEquals((await chainFrames(call)).map((f) => f.image), [null, null])
    assertEquals(images.prompts.length, 0)

    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 1 })
    assertEquals(await settled(call), [])
    const [opening, second] = await chainFrames(call)
    assertMatch(second.image!, /^frame-1-[0-9a-f]{8}\.png$/)
    assertEquals(opening.image, null)
    const again = await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 1 })
    assertEquals(again.status, 409) // a Chain Frame's picture never changes once made

    // Switched back on, the next Frame renders as it's made.
    await call('PUT', '/api/sessions/s1/render-frames', { renderFrames: true })
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Kneel' }))
    assertMatch((await chainFrames(call))[2].image!, /^frame-2-[0-9a-f]{8}\.png$/)
    assertEquals(images.prompts.length, 2)
  }))

Deno.test('A failed upscale leaves the Frame as it was', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = await chainOfTwo(root, { imageGenerator: images })
    images.upscale = () => Promise.reject(new Error('SeedVR2 upscaler failed: out of memory'))
    await call('POST', '/api/sessions/s1/jobs', { kind: 'upscale', frameIndex: 0 })
    const [failed] = await settled(call)
    assertEquals(failed.error, 'SeedVR2 upscaler failed: out of memory')
    assertEquals((await chainFrames(call))[0].upscaled, undefined)
  }))

Deno.test('A Storyboard Frame upscales once rendered; a re-render replaces the upscale', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([], [], { plans: [planOf(2)] }),
    })
    await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'A dunk.', frameCount: 2 })
    await readEvents(await call('POST', '/api/sessions/s1/plan'))
    const job = (kind: string) => call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 0 })
    assertEquals((await job('upscale')).status, 409) // nothing to upscale yet

    await job('render')
    await settled(call)
    assertEquals((await job('upscale')).status, 201)
    await settled(call)
    const upscaled = (await storyboardFrames(call))[0].upscaled!
    assertMatch(upscaled, /-2048\.png$/)

    await job('render')
    await settled(call)
    assertEquals((await storyboardFrames(call))[0].upscaled, undefined)
    assertEquals((await call('GET', `/api/sessions/s1/images/${upscaled}`)).status, 404)
  }))

Deno.test('A Storyboard queues SHARP, TripoSplat and LiTo; a re-render drops them', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([], [], { plans: [planOf(2)] }),
      scene: fakeSceneMaker(),
      figure: fakeFigureMaker(),
      lito: fakeFigureMaker(),
    })
    await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'A dunk.', frameCount: 2 })
    await readEvents(await call('POST', '/api/sessions/s1/plan'))
    const job = (kind: string) => call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 1 })
    assertEquals((await job('scene')).status, 409) // no picture, and none coming
    // Queued back to back: the 3D waits behind the render that makes its picture.
    await job('render')
    for (const kind of ['scene', 'figure', 'lito']) assertEquals((await job(kind)).status, 201)
    assertEquals(await settled(call), [])
    const made = (await storyboardFrames(call))[1]
    assertMatch(made.scene!.file, /^scene-1-[0-9a-f]{8}\.ply$/)
    assertMatch(made.figure!.file, /^figure-1-[0-9a-f]{8}\.ply$/)
    assertMatch(made.lito!.file, /^lito-1-[0-9a-f]{8}\.ply$/)

    // Edited by hand, the picture and what was made from it stay (stale) until rendered again.
    await call('PUT', '/api/sessions/s1/frames/1', { body: 'He lands.' })
    const edited = (await storyboardFrames(call))[1]
    assertEquals([edited.stale, edited.scene, edited.lito], [true, made.scene, made.lito])
    await job('render')
    await settled(call)
    const rerendered = (await storyboardFrames(call))[1]
    assertEquals([rerendered.stale, rerendered.scene, rerendered.figure], [
      undefined,
      undefined,
      undefined,
    ])
    assertEquals((await call('GET', `/api/sessions/s1/images/${made.scene!.file}`)).status, 404)
  }))

Deno.test('Upscale uses the upscaler chosen in Settings now, even mid-Session', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call, settings } = await chainOfTwo(root, { imageGenerator: images })
    settings.current = { ...settings.current, upscaler: 'seedvr2-3b' }
    await call('POST', '/api/sessions/s1/jobs', { kind: 'upscale', frameIndex: 0 })
    await settled(call)
    assertEquals(images.upscalers, ['seedvr2-3b'])
  }))

Deno.test("A Roleplay's Cast is written and reviewed, then it begins, is talked to, undone and edited", () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      roleplayModel: scriptedRoleplayModel({
        casts: [testCast, testCast],
        replies: [replyOf('You are late.'), replyOf('Take the wheel.')],
      }),
    })
    const created = await (await call('POST', '/api/sessions', {
      kind: 'roleplay',
      brief: 'A storm at sea.',
    })).json()
    assertEquals([created.kind, created.cast, created.frames], ['roleplay', null, []])
    assertEquals(
      (await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Hi' })).status,
      409,
    )

    const written = await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    assertEquals(written.map(([e]) => e), ['phase', 'cast'])
    // Not begun yet: no Messages, but the Cast can be rewritten.
    assertEquals(
      (await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Hi' })).status,
      409,
    )
    const rewritten = await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    assertEquals(rewritten.at(-1)![0], 'cast')

    const begun = await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin'))
    assertEquals(begun.map(([e]) => e), [
      'phase',
      'reply-part',
      'reply-part',
      'reply-part',
      'replied',
    ])
    assertEquals((await call('POST', '/api/sessions/s1/roleplay/begin')).status, 409)
    assertEquals((await call('POST', '/api/sessions/s1/roleplay/cast')).status, 409)

    assertEquals(
      (await call('POST', '/api/sessions/s1/roleplay/messages', { text: ' ' })).status,
      400,
    )
    const talk = await readEvents(
      await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Sorry, captain.' }),
    )
    assertEquals(talk.map(([e]) => e), [
      'phase',
      'reply-part',
      'reply-part',
      'reply-part',
      'replied',
    ])

    const undone = await (await call('DELETE', '/api/sessions/s1/roleplay/frames/1')).json()
    assertEquals(undone.frames.length, 1)
    assertEquals((await call('DELETE', '/api/sessions/s1/roleplay/frames/0')).status, 409)

    const young = { ...testCast, character: { ...testCast.character, age: 16 } }
    assertEquals((await call('PUT', '/api/sessions/s1/roleplay/cast', young)).status, 400)
    const renamed = { ...testCast, persona: { ...testCast.persona, name: 'Alex' } }
    const edited = await (await call('PUT', '/api/sessions/s1/roleplay/cast', renamed)).json()
    assertEquals(edited.cast.persona.name, 'Alex')

    const [summary] = await (await call('GET', '/api/sessions')).json()
    assertEquals([summary.kind, summary.frames, summary.latestImage], ['roleplay', 1, null])
    assertEquals(summary.excerpt, 'You are late.')
  }))

Deno.test('Suggest streams a Message for the player, from their draft, and saves nothing', () =>
  withTempDir(async (root) => {
    const model = scriptedRoleplayModel({
      casts: [testCast],
      replies: [replyOf('You are late.')],
      suggestions: ['Sam: I ask about the cargo.'],
    })
    const { call } = setup({
      root,
      settings: { textModel: 'x', thinking: true },
      roleplayModel: model,
    })
    await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    const suggest = (draft?: unknown) =>
      call('POST', '/api/sessions/s1/roleplay/suggest', draft === undefined ? {} : { draft })
    assertEquals((await suggest()).status, 409)

    await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin'))
    assertEquals((await suggest('x'.repeat(4001))).status, 400)
    const events = await readEvents(await suggest('cargo?'))
    assertEquals(events.map(([e]) => e), [
      'phase',
      'suggestion-part',
      'suggestion-part',
      'suggestion',
    ])
    assertEquals(events.at(-1)![1].text, 'I ask about the cargo.')
    assertMatch(model.suggested[0][1].content, /cargo\?/)
    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(session.frames.length, 1)

    // Out of suggestions: the stream reports the failure, and the Roleplay is free again.
    assertEquals((await readEvents(await suggest())).at(-1)![0], 'failed')
    assertEquals((await suggest()).status, 200)
  }))

Deno.test('A failed first Cast discards the Roleplay; other kinds refuse Roleplay routes', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      roleplayModel: scriptedRoleplayModel({ casts: [new Error('down'), new Error('down')] }),
    })
    await call('POST', '/api/sessions', { kind: 'roleplay', scenarioId: 'test' })
    const events = await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    assertEquals(events.at(-1)![1], { type: 'failed', message: 'down', sessionDiscarded: true })
    assertEquals((await call('GET', '/api/sessions/s1')).status, 404)

    await call('POST', '/api/sessions', { scenarioId: 'test' })
    assertEquals((await call('POST', '/api/sessions/s2/roleplay/cast')).status, 409)
  }))

Deno.test('Turning the Limits off in Settings applies at once, except the adult Limit', () =>
  withTempDir(async (root) => {
    const { call, settings } = setup({ root, settings: { textModel: 'x' } })
    try {
      settings.current = { ...settings.current, limits: false }
      const nude = await call('POST', '/api/sessions', { brief: 'A nude figure study.' })
      assertEquals(nude.status, 201)
      const young = await call('POST', '/api/sessions', { brief: 'A fifteen-year-old runner.' })
      assertEquals(young.status, 422)
    } finally {
      settings.current = { ...settings.current, limits: true }
      await call('GET', '/api/sessions')
    }
    assertEquals(
      (await call('POST', '/api/sessions', { brief: 'A nude figure study.' })).status,
      422,
    )
  }))

/** Waits until a Session's queue has no queued or running jobs, and returns what's left. */
/** A Storyboard's Frames as saved now. */
async function storyboardFrames(call: ReturnType<typeof setup>['call'], id = 's1') {
  return ((await (await call('GET', `/api/sessions/${id}`)).json()).frames as JsonFrame[]).map(
    shown,
  )
}

async function settled(call: ReturnType<typeof setup>['call'], id = 's1') {
  for (let i = 0; i < 200; i++) {
    const jobs = await (await call('GET', `/api/sessions/${id}/jobs`)).json()
    if (!jobs.some((j: { status: string }) => j.status !== 'failed')) return jobs
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('jobs never settled')
}

/** A begun Roleplay whose Art Agent will write `bodies` in turn. */
async function roleplayWithArt(
  root: string,
  bodies: string[],
  extra: Partial<SetupOptions> = {},
) {
  const harness = setup({
    root,
    settings: { textModel: 'x' },
    roleplayModel: scriptedRoleplayModel({
      casts: [testCast],
      replies: [replyOf('You are late.'), replyOf('Take the wheel.')],
      looks: [testLook('Ink.', 'Mira Vance, 34.', 'Sam Reyes, 25.')],
      bodies,
    }),
    ...extra,
  })
  const { call } = harness
  await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
  await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
  await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin'))
  return harness
}

const artBody = 'Mira waits. She frowns. A wide shot. A navy coat. The bridge. Lamplight. Blues.'

Deno.test('Picturing, rendering and upscaling a Roleplay Frame are queued jobs, run in order', () =>
  withTempDir(async (root) => {
    const { call } = await roleplayWithArt(root, [artBody])
    assertEquals((await call('PUT', '/api/sessions/s1/roleplay/look', {})).status, 409)
    const enqueue = (kind: string, frameIndex = 0) =>
      call('POST', '/api/sessions/s1/jobs', { kind, frameIndex })
    assertEquals((await enqueue('picture', 5)).status, 404)
    assertEquals((await enqueue('paint')).status, 400)

    // Queued back to back: the render waits for the picture, the upscale for the render.
    const queued = await (await enqueue('picture')).json()
    await enqueue('render')
    await enqueue('upscale')
    assertEquals(queued.length, 1)
    assertEquals(await settled(call), [])

    const session = await (await call('GET', '/api/sessions/s1')).json()
    const frame = shown(session.frames[0])
    assertEquals(frame.prompt, `Mira Vance, 34. Sam Reyes, 25. ${artBody} Ink.`)
    assertEquals((await call('GET', `/api/sessions/s1/images/${frame.image}`)).status, 200)
    assertMatch(frame.upscaled, /-2048\.png$/)

    const look = await call(
      'PUT',
      '/api/sessions/s1/roleplay/look',
      testLook('Watercolour.', 'Mira Vance, 34.', 'Sam Reyes, 25.'),
    )
    assertEquals(shown((await look.json()).frames[0]).stale, true)
    const [card] = await (await call('GET', '/api/sessions')).json()
    assertEquals(card.latestImage, frame.image)
  }))

Deno.test('A picture goes ahead of queued renders, and Clear empties the queue', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    const holding = {
      ...images,
      async generate(...args: Parameters<typeof images.generate>) {
        const signal = args[1]
        await Promise.race([
          held,
          new Promise((_, no) => signal.addEventListener('abort', () => no(signal.reason))),
        ])
        return images.generate(...args)
      },
    }
    const { call } = await roleplayWithArt(root, [artBody, artBody], { imageGenerator: holding })
    const enqueue = (kind: string, frameIndex: number) =>
      call('POST', '/api/sessions/s1/jobs', { kind, frameIndex })
    await enqueue('picture', 0)
    await settled(call)
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Sorry.' }))
    // Frame 0's render holds the queue; Frame 1's is queued behind it, then its picture.
    await enqueue('render', 0)
    await enqueue('render', 1)
    const jobs = await (await enqueue('picture', 1)).json()
    assertEquals(
      jobs.map((j: { kind: string; frameIndex: number }) => `${j.kind} ${j.frameIndex}`),
      ['render 0', 'picture 1', 'render 1'],
    )

    const cleared = await call('DELETE', '/api/sessions/s1/jobs')
    assertEquals(cleared.status, 200)
    release()
    assertEquals(await settled(call), [])
    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(session.frames.map((f: { pictures: unknown[] }) => f.pictures.length), [0, 0])
    assertEquals(session.frames[1].prompt, undefined)
  }))

Deno.test('A failed job stays listed to retry or dismiss', () =>
  withTempDir(async (root) => {
    const { call } = await roleplayWithArt(root, [])
    // Rendering a Frame that was never pictured fails.
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 0 })
    const [failed] = await settled(call)
    assertEquals([failed.status, failed.error], ['failed', "Frame 0 isn't pictured yet"])
    // Kept, so it can be retried: back in the queue, where it fails again (still no picture).
    const retried = await call('POST', `/api/sessions/s1/jobs/${failed.id}/retry`)
    assertEquals(retried.status, 200)
    const [again] = await settled(call)
    assertEquals([again.id, again.status], [failed.id, 'failed'])
    assertEquals((await call('POST', '/api/sessions/s1/jobs/nope/retry')).status, 404)
    const dismissed = await call('DELETE', `/api/sessions/s1/jobs/${failed.id}`)
    assertEquals(await dismissed.json(), [])
    assertEquals((await call('DELETE', '/api/sessions/s1/jobs/nope')).status, 404)
  }))

Deno.test('A Roleplay Frame is pictured with Pictures off, but not rendered', () =>
  withTempDir(async (root) => {
    const { call, settings } = await roleplayWithArt(root, [artBody])
    settings.current = {
      ...settings.current,
      features: { ...settings.current.features, images: false },
    }
    const queue = (kind: string) => call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 0 })
    assertEquals((await queue('picture')).status, 201)
    assertEquals(await settled(call), [])
    const render = await queue('render')
    assertEquals([render.status, (await render.json()).error], [
      409,
      'Pictures is switched off in Settings',
    ])
    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertMatch(session.frames[0].prompt, /Mira waits\./)
  }))

Deno.test('The conversation carries on while a job runs, and neither overwrites the other', () =>
  withTempDir(async (root) => {
    let release!: () => void
    const images = fakeImageGenerator()
    const held = new Promise<void>((r) => (release = r))
    const slow = {
      ...images,
      async generate(...args: Parameters<typeof images.generate>) {
        await held
        return images.generate(...args)
      },
    }
    const { call } = await roleplayWithArt(root, [artBody], { imageGenerator: slow })
    await call('POST', '/api/sessions/s1/jobs', { kind: 'picture', frameIndex: 0 })
    await settled(call)
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 0 })
    await new Promise((r) => setTimeout(r, 20))

    // The render is running; a Message still goes through.
    const talk = await readEvents(
      await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Sorry.' }),
    )
    assertEquals(talk.at(-1)![0], 'replied')
    release()
    await settled(call)
    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(session.frames.length, 2)
    assertMatch(shown(session.frames[0]).image, /^frame-0-/)
  }))

Deno.test('Undoing an exchange cancels its jobs; deleting the Roleplay cancels them all', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator({ hang: true })
    const { call } = await roleplayWithArt(root, [artBody, artBody], { imageGenerator: images })
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Sorry.' }))
    for (const frameIndex of [1, 1]) {
      await call('POST', '/api/sessions/s1/jobs', { kind: 'picture', frameIndex })
    }
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 1 })
    await settled(call).catch(() => {})
    assertEquals((await call('DELETE', '/api/sessions/s1/roleplay/frames/1')).status, 200)
    assertEquals(await settled(call), [])
  }))

Deno.test('Pictures are written as tags when Settings ask, recorded on the Frame', () =>
  withTempDir(async (root) => {
    const artist = scriptedRoleplayModel({
      name: 'artist',
      looks: [testLook('Ink.', 'Mira Vance, 34.', 'Sam Reyes, 25.')],
      bodies: [artBody, artBody],
    })
    const { call, settings } = await roleplayWithArt(root, [], { roleplayModels: { artist } })
    settings.current = { ...settings.current, artModel: 'artist', artStyle: 'tags' }
    await call('POST', '/api/sessions/s1/jobs', { kind: 'picture', frameIndex: 0 })
    assertEquals(await settled(call), [])
    let session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(session.frames[0].pictureStyle, 'tags')
    settings.current = { ...settings.current, artStyle: 'prose' }
    await call('POST', '/api/sessions/s1/jobs', { kind: 'picture', frameIndex: 0 })
    assertEquals(await settled(call), [])
    session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(session.frames[0].pictureStyle, undefined)
    assertEquals(artist.styles, ['tags', 'prose'])
  }))

Deno.test("Speaking a Frame designs the Character's voice first, and serves the audio", () =>
  withTempDir(async (root) => {
    const voice = fakeVoiceEngine()
    const model = scriptedRoleplayModel({
      casts: [testCast],
      replies: [replyOf('You are late.'), replyOf('...')],
      voices: ['A low, husky woman.'],
    })
    const { call } = setup({ root, settings: { textModel: 'x' }, roleplayModel: model, voice })
    await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin'))
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Sorry.' }))
    const job = (kind: string, frameIndex: number) =>
      call('POST', '/api/sessions/s1/jobs', { kind, frameIndex })
    assertEquals((await job('speak', 1)).status, 409)

    assertEquals((await job('speak', 0)).status, 201)
    assertEquals(await settled(call), [])
    let session = await (await call('GET', '/api/sessions/s1')).json()
    const { ref } = session.voice
    assertEquals(session.voice, {
      description: 'A low, husky woman.',
      model: 'scripted',
      ref,
      takes: 1,
    })
    assertEquals(session.frames[0].speech.ref, ref)
    const audio = await call('GET', `/api/sessions/s1/images/${session.frames[0].speech.file}`)
    assertEquals([audio.status, audio.headers.get('Content-Type')], [200, 'audio/mpeg'])
    assertMatch(session.frames[0].speech.file, /^speech-0-[0-9a-f]{8}\.mp3$/)
    assertMatch(await audio.text(), /fake speak: You are late\./)

    // A new description drops the voice; the next take designs it from that description.
    const put = await call('PUT', '/api/sessions/s1/roleplay/voice', { description: 'A deep man.' })
    assertEquals((await put.json()).voice, { description: 'A deep man.' })
    assertEquals((await call('PUT', '/api/sessions/s1/roleplay/voice', {})).status, 400)
    await job('voice', 0)
    assertEquals(await settled(call), [])
    session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(session.voice.description, 'A deep man.')
    assertEquals(voice.calls.map((c) => c.kind), ['design', 'speak', 'design'])
    assertEquals((voice.calls[2].req as { description: string }).description, 'A deep man.')
  }))

Deno.test('Without a voice service, speaking fails with a reason', () =>
  withTempDir(async (root) => {
    const { call } = await roleplayWithArt(root, [])
    const res = await call('POST', '/api/sessions/s1/jobs', { kind: 'speak', frameIndex: 0 })
    assertEquals([res.status, (await res.json()).error], [
      409,
      "Voices isn't available here: No voice service was set up; or choose ComfyUI for Voices in Settings",
    ])
  }))

Deno.test('A rendered Frame makes a 3D scene, served; a re-render or Undo removes it', () =>
  withTempDir(async (root) => {
    const scene = fakeSceneMaker()
    const { call } = await roleplayWithArt(root, [artBody, artBody], { scene })
    const job = (kind: string, frameIndex: number) =>
      call('POST', '/api/sessions/s1/jobs', { kind, frameIndex })
    assertEquals((await job('scene', 0)).status, 409)

    await job('picture', 0)
    await job('render', 0)
    assertEquals(await settled(call), [])
    await job('scene', 0)
    assertEquals(await settled(call), [])
    let frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[0])
    assertEquals(scene.made.map((m) => m.image), [join(root, 's1', frame.image)])
    assertMatch(frame.scene.file, /^scene-0-[0-9a-f]{8}\.ply$/)
    assertEquals([frame.scene.splats, frame.scene.pivot, frame.scene.fov], [4, 1.5, 51.3])
    assertEquals(frame.scene.from, frame.image)
    const ply = await call('GET', `/api/sessions/s1/images/${frame.scene.file}`)
    assertEquals([ply.status, await ply.text()], [200, `ply fake scene of ${scene.made[0].image}`])

    // Made again, it replaces the old file; a re-render drops it.
    const first = frame.scene.file
    await job('scene', 0)
    await settled(call)
    frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[0])
    assertNotEquals(frame.scene.file, first)
    assertEquals((await call('GET', `/api/sessions/s1/images/${first}`)).status, 404)
    const second = frame.scene.file
    await job('render', 0)
    await settled(call)
    frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[0])
    assertEquals(frame.scene, undefined)
    assertEquals((await call('GET', `/api/sessions/s1/images/${second}`)).status, 404)

    // Undoing an exchange removes its scene.
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Sorry.' }))
    await job('picture', 1)
    await job('render', 1)
    await settled(call)
    await job('scene', 1)
    await settled(call)
    frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[1])
    await call('DELETE', '/api/sessions/s1/roleplay/frames/1')
    assertEquals((await call('GET', `/api/sessions/s1/images/${frame.scene.file}`)).status, 404)
  }))

Deno.test('A scene is made from the upscale when there is one', () =>
  withTempDir(async (root) => {
    const scene = fakeSceneMaker()
    const { call } = await roleplayWithArt(root, [artBody], { scene })
    for (const kind of ['picture', 'render', 'upscale', 'scene']) {
      await call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 0 })
      assertEquals(await settled(call), [])
    }
    const frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[0])
    assertMatch(frame.upscaled, /-2048\.png$/)
    assertEquals(frame.scene.from, frame.upscaled)
    assertEquals(scene.made[0].image, join(root, 's1', frame.upscaled))
  }))

Deno.test('A figure lifted from a Frame is served, and goes with a re-render', () =>
  withTempDir(async (root) => {
    const figure = fakeFigureMaker()
    const { call } = await roleplayWithArt(root, [artBody], { figure })
    const job = (kind: string) => call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 0 })
    assertEquals((await job('figure')).status, 409)
    for (const kind of ['picture', 'render', 'figure']) {
      await job(kind)
      assertEquals(await settled(call), [])
    }
    let frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[0])
    assertEquals(frame.figure.from, frame.image)
    assertMatch(frame.figure.file, /^figure-0-[0-9a-f]{8}\.ply$/)
    const ply = await call('GET', `/api/sessions/s1/images/${frame.figure.file}`)
    assertEquals(ply.status, 200)
    const file = frame.figure.file
    await job('render')
    await settled(call)
    frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[0])
    assertEquals(frame.figure, undefined)
    assertEquals((await call('GET', `/api/sessions/s1/images/${file}`)).status, 404)
  }))

Deno.test('A LiTo figure is kept beside the TripoSplat one, served, and goes with a re-render', () =>
  withTempDir(async (root) => {
    const figure = fakeFigureMaker(), lito = fakeFigureMaker()
    const { call } = await roleplayWithArt(root, [artBody], { figure, lito })
    const job = (kind: string) => call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 0 })
    assertEquals((await job('lito')).status, 409)
    for (const kind of ['picture', 'render', 'figure', 'lito']) {
      await job(kind)
      assertEquals(await settled(call), [])
    }
    let frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[0])
    assertMatch(frame.figure.file, /^figure-0-[0-9a-f]{8}\.ply$/)
    assertMatch(frame.lito.file, /^lito-0-[0-9a-f]{8}\.ply$/)
    assertEquals([figure.made.length, lito.made.length], [1, 1])
    assertEquals((await call('GET', `/api/sessions/s1/images/${frame.lito.file}`)).status, 200)
    const file = frame.lito.file
    await job('render')
    await settled(call)
    frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[0])
    assertEquals([frame.figure, frame.lito], [undefined, undefined])
    assertEquals((await call('GET', `/api/sessions/s1/images/${file}`)).status, 404)
  }))

Deno.test('Without SHARP, making a scene fails with a reason', () =>
  withTempDir(async (root) => {
    const { call } = await roleplayWithArt(root, [artBody])
    for (const kind of ['picture', 'render']) {
      await call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 0 })
      await settled(call)
    }
    const res = await call('POST', '/api/sessions/s1/jobs', { kind: 'scene', frameIndex: 0 })
    assertEquals((await res.json()).error, "SHARP isn't available here: No SHARP was set up")
  }))

Deno.test('Pictures use the Art Agent model set in Settings, recorded on the Frame', () =>
  withTempDir(async (root) => {
    const artist = scriptedRoleplayModel({
      name: 'artist',
      looks: [testLook('Ink.', 'Mira Vance, 34.', 'Sam Reyes, 25.')],
      bodies: [artBody],
    })
    const { call, settings } = await roleplayWithArt(root, [], { roleplayModels: { artist } })
    settings.current = { ...settings.current, artModel: 'artist' }
    await call('POST', '/api/sessions/s1/jobs', { kind: 'picture', frameIndex: 0 })
    assertEquals(await settled(call), [])
    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals([session.lookModel, session.frames[0].pictureModel], ['artist', 'artist'])
    assertEquals(artist.art.length, 2)
  }))

Deno.test('A voice is designed while the Cast is reviewed, before the scene begins', () =>
  withTempDir(async (root) => {
    const voice = fakeVoiceEngine()
    const model = scriptedRoleplayModel({ casts: [testCast], voices: ['A low, husky woman.'] })
    const { call } = setup({ root, settings: { textModel: 'x' }, roleplayModel: model, voice })
    await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    const job = (kind: string, frameIndex: number) =>
      call('POST', '/api/sessions/s1/jobs', { kind, frameIndex })
    // No Frame yet: a voice is the Session's, so it's queued all the same; a line isn't.
    assertEquals((await job('voice', 0)).status, 201)
    assertEquals((await job('speak', 0)).status, 404)
    assertEquals((await job('voice', 1)).status, 404)
    assertEquals(await settled(call), [])
    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals([session.frames.length, session.voice.description], [0, 'A low, husky woman.'])
    assertEquals(voice.calls.map((c) => c.kind), ['design'])
  }))
