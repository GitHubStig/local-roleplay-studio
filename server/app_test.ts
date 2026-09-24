import { assertEquals, assertMatch } from '@std/assert'
import { createHandler } from './app.ts'
import { renderPrompt } from './imagePrompt.ts'
import type { TextModelInfo } from './ollama.ts'
import type { ImageGenerator } from './imageGenerator.ts'
import { dirSessionStore } from './session.ts'
import { DEFAULT_SETTINGS, type Settings, type SettingsStore } from './settings.ts'
import type { TextModel } from './textModel.ts'
import {
  fakeImageGenerator,
  promptWith,
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
  listTextModels?: () => Promise<TextModelInfo[]>
  textModel?: TextModel
  imageGenerator?: ImageGenerator
  settings?: Partial<Settings>
}

function setup(opts: SetupOptions = {}) {
  let sessionCount = 0
  const settings = memoryStore({ ...DEFAULT_SETTINGS, ...opts.settings })
  const sessions = dirSessionStore(opts.root ?? '/nonexistent')
  const handler = createHandler({
    settings,
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
  assertEquals(body.textModels, ['llama3:latest', 'qwen3.8:27b-mlx'])
  assertEquals(body.thinkingModels, ['qwen3.8:27b-mlx'])
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
    const [firstImage, secondImage] = session.turns.map((t: { image: string }) => t.image)
    assertMatch(firstImage, /^turn-0-[0-9a-f]{8}\.png$/)

    const image = await call('GET', `/api/sessions/s1/images/${secondImage}`)
    assertEquals(image.headers.get('Content-Type'), 'image/png')
    assertEquals(await image.text(), renderPrompt(promptWith('sitting')))
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

Deno.test('DELETE /api/sessions/:id/turns/:index undoes only the latest Turn', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/turns', {}))
    await readEvents(await call('POST', '/api/sessions/s1/turns', { action: 'Sit' }))

    assertEquals((await call('DELETE', '/api/sessions/s1/turns/0')).status, 409)
    assertEquals((await call('DELETE', '/api/sessions/s1/turns/x')).status, 400)
    const res = await call('DELETE', '/api/sessions/s1/turns/1')
    assertEquals(res.status, 200)
    assertEquals((await res.json()).turns.length, 1)
    assertEquals((await call('DELETE', '/api/sessions/s1/turns/1')).status, 409)
    assertEquals((await call('DELETE', '/api/sessions/s1/turns/0')).status, 409)
  }))

Deno.test('Undo is refused while a Turn is in progress', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting')]),
      imageGenerator: fakeImageGenerator({ hang: true }),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    const res = await call('POST', '/api/sessions/s1/turns', {})
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
    let seen = ''
    while (!seen.includes('"phase":"image"')) seen += (await reader.read()).value
    assertEquals((await call('DELETE', '/api/sessions/s1/turns/0')).status, 409)
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
    await readEvents(await call('POST', '/api/sessions/s1/turns', {}))
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s2/turns', {}))
    // Timestamps have millisecond resolution; make s1's latest Turn clearly the newest.
    await new Promise((r) => setTimeout(r, 5))
    await readEvents(await call('POST', '/api/sessions/s1/turns', { action: 'Sit' }))

    const list = await (await call('GET', '/api/sessions')).json()
    assertEquals(list.map((s: { id: string }) => s.id), ['s1', 's2'])
    assertEquals(list[0].scenarioTitle, 'Test Shoot')
    assertEquals(list[0].turns, 2)
    assertMatch(list[0].latestImage, /^turn-1-/)
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
    await readEvents(await call('POST', '/api/sessions/s1/turns', {}))
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

Deno.test('Images render one at a time across Sessions; a waiting Turn is queued', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting')]),
      imageGenerator: fakeImageGenerator({ hang: true }),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    const a = (await call('POST', '/api/sessions/s1/turns', {})).body!
      .pipeThrough(new TextDecoderStream()).getReader()
    await readUntil(a, '"phase":"image"')

    const b = (await call('POST', '/api/sessions/s2/turns', {})).body!
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

Deno.test('Two Turns sent at once for one Session: only one runs', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting'), reply('kneeling')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/turns', {}))

    const [a, b] = await Promise.all([
      call('POST', '/api/sessions/s1/turns', { action: 'Sit' }),
      call('POST', '/api/sessions/s1/turns', { action: 'Kneel' }),
    ])
    assertEquals([a.status, b.status].sort(), [200, 409])
    await readEvents(a.status === 200 ? a : b)
    await (a.status === 200 ? b : a).body?.cancel()

    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(session.turns.map((t: { index: number }) => t.index), [0, 1])
  }))

Deno.test('Undo and a Turn sent at once never bring back the undone Turn', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting'), reply('kneeling')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/turns', {}))
    await readEvents(await call('POST', '/api/sessions/s1/turns', { action: 'Sit' }))

    const [undo, turn] = await Promise.all([
      call('DELETE', '/api/sessions/s1/turns/1'),
      call('POST', '/api/sessions/s1/turns', { action: 'Kneel' }),
    ])
    if (turn.status === 200) await readEvents(turn)
    else await turn.body?.cancel()
    assertEquals([undo.status, turn.status].includes(409), true)

    // Whatever won, every Turn is numbered in order and its image exists.
    const session = await (await call('GET', '/api/sessions/s1')).json()
    session.turns.forEach((t: { index: number }, i: number) => assertEquals(t.index, i))
    for (const t of session.turns as { image: string }[]) {
      assertEquals((await call('GET', `/api/sessions/s1/images/${t.image}`)).status, 200)
    }
  }))

Deno.test('A Session is free again after a Turn, a failed Turn, an early refusal and an Undo', () =>
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
    await readEvents(await call('POST', '/api/sessions/s1/turns', {}))
    const failed = await readEvents(await call('POST', '/api/sessions/s1/turns', { action: 'A' }))
    assertEquals(failed.at(-1)![0], 'failed')
    assertEquals((await call('POST', '/api/sessions/s1/turns', {})).status, 400)
    await readEvents(await call('POST', '/api/sessions/s1/turns', { action: 'Sit' }))
    assertEquals((await call('DELETE', '/api/sessions/s1/turns/1')).status, 200)
    const last = await readEvents(await call('POST', '/api/sessions/s1/turns', { action: 'Kneel' }))
    assertEquals(last.at(-1)![0], 'committed')
    assertEquals((await call('DELETE', '/api/sessions/s1')).status, 204)
  }))
