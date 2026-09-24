import { assertEquals } from '@std/assert'
import { createHandler } from './app.ts'
import type { ImageGenerator } from './imageGenerator.ts'
import { dirSessionStore } from './session.ts'
import { DEFAULT_SETTINGS, type Settings, type SettingsStore } from './settings.ts'
import type { TextModel } from './textModel.ts'
import {
  fakeImageGenerator,
  reply,
  scenarioLibrary,
  scriptedTextModel,
  withTempDir,
} from './testing.ts'

function memoryStore(initial: Settings = { ...DEFAULT_SETTINGS }): SettingsStore & {
  current: Settings
} {
  const store = {
    current: initial,
    load: () => Promise.resolve(store.current),
    save: (s: Settings) => {
      store.current = s
      return Promise.resolve()
    },
  }
  return store
}

interface SetupOptions {
  root?: string
  listTextModels?: () => Promise<string[]>
  textModel?: TextModel
  imageGenerator?: ImageGenerator
  settings?: Partial<Settings>
}

function setup(opts: SetupOptions = {}) {
  const settings = memoryStore({ ...DEFAULT_SETTINGS, ...opts.settings })
  const sessions = dirSessionStore(opts.root ?? '/nonexistent')
  const handler = createHandler({
    settings,
    listTextModels: opts.listTextModels ?? (() => Promise.resolve(['llama3:latest'])),
    scenarios: scenarioLibrary,
    sessions,
    textModel: () => opts.textModel ?? scriptedTextModel([]),
    imageGenerator: opts.imageGenerator ?? fakeImageGenerator(),
    newSessionId: () => 's1',
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
  assertEquals(await res.json(), DEFAULT_SETTINGS)
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

Deno.test('GET /api/settings/options lists Ollama and image models', async () => {
  const body = await (await setup().call('GET', '/api/settings/options')).json()
  assertEquals(body.textModels, ['llama3:latest'])
  assertEquals(body.imageModels[0].id, 'flux2-klein-4b')
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
    assertEquals(session.seed, 1234)
    assertEquals(session.settings.textModel, 'llama3:latest')
    assertEquals(session.turns, [])
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

Deno.test('Turns stream progress and commit, then serve their image', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })

    const opening = await readEvents(await call('POST', '/api/sessions/s1/turns', {}))
    assertEquals(opening.map(([e]) => e), ['phase', 'text', 'phase', 'committed'])

    assertEquals((await call('POST', '/api/sessions/s1/turns', {})).status, 400)
    const second = await readEvents(await call('POST', '/api/sessions/s1/turns', { action: 'Sit' }))
    assertEquals(second.at(-1)![1].turn, {
      ...(second.at(-1)![1].turn as object),
      index: 1,
      action: 'Sit',
    })

    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(session.turns.map((t: { image: string }) => t.image), ['turn-0.png', 'turn-1.png'])

    const image = await call('GET', '/api/sessions/s1/images/turn-1.png')
    assertEquals(image.headers.get('Content-Type'), 'image/png')
    assertEquals(await image.text(), 'studio photo, pose: sitting')
    assertEquals((await call('GET', '/api/sessions/s1/images/session.json')).status, 404)
  }))

Deno.test('A failed Opening Turn discards the Session', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing')]),
      imageGenerator: fakeImageGenerator({ fail: true }),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    const events = await readEvents(await call('POST', '/api/sessions/s1/turns', {}))
    assertEquals(events.at(-1), [
      'failed',
      { type: 'failed', message: 'mflux crashed', sessionDiscarded: true },
    ])
    assertEquals((await call('GET', '/api/sessions/s1')).status, 404)
  }))

Deno.test('Cancel aborts the Turn in progress and rejects overlapping Turns', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing')]),
      imageGenerator: fakeImageGenerator({ hang: true }),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    const res = await call('POST', '/api/sessions/s1/turns', {})
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
    let seen = ''
    while (!seen.includes('"phase":"image"')) seen += (await reader.read()).value

    assertEquals((await call('POST', '/api/sessions/s1/turns', {})).status, 409)
    assertEquals((await call('POST', '/api/sessions/s1/cancel')).status, 204)

    let rest = ''
    for (let r = await reader.read(); !r.done; r = await reader.read()) rest += r.value
    assertEquals(rest.includes('event: cancelled'), true)
    assertEquals(rest.includes('"sessionDiscarded":true'), true)
  }))

Deno.test('End closes a Session to further Turns', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/turns', {}))
    const ended = await (await call('POST', '/api/sessions/s1/end')).json()
    assertEquals(ended.status, 'ended')
    assertEquals((await call('POST', '/api/sessions/s1/turns', { action: 'Sit' })).status, 409)
    assertEquals((await call('POST', '/api/sessions/s1/end')).status, 409)
  }))
