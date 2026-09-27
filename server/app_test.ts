import { assertEquals, assertMatch } from '@std/assert'
import { createHandler } from './app.ts'
import { renderPrompt } from './imagePrompt.ts'
import type { TextModelInfo } from './ollama.ts'
import type { ImageGenerator } from './imageGenerator.ts'
import { dirSessionStore } from './session.ts'
import { DEFAULT_SETTINGS, type Settings, type SettingsStore } from './settings.ts'
import type { TextModel } from './textModel.ts'
import type { RoleplayModel } from './roleplay/model.ts'
import { replyOf, scriptedRoleplayModel, testCast } from './roleplay/testing.ts'
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
  roleplayModel?: RoleplayModel
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
    roleplayModel: () => opts.roleplayModel ?? scriptedRoleplayModel({}),
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
    const [firstImage, secondImage] = session.frames.map((t: { image: string }) => t.image)
    assertMatch(firstImage, /^frame-0-[0-9a-f]{8}\.png$/)

    const image = await call('GET', `/api/sessions/s1/images/${secondImage}`)
    assertEquals(image.headers.get('Content-Type'), 'image/png')
    assertEquals(await image.text(), renderPrompt(promptWith('sitting')))
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
    for (const t of session.frames as { image: string }[]) {
      assertEquals((await call('GET', `/api/sessions/s1/images/${t.image}`)).status, 200)
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
    for (const frameCount of [0, 17, 2.5]) {
      assertEquals(
        (await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'x', frameCount }))
          .status,
        400,
      )
    }
  }))

Deno.test('A Storyboard plans, renders, and is edited by hand and by Action over the API', () =>
  withTempDir(async (root) => {
    const newLook = { subject: 'A tall adult athlete.', style: 'Watercolour.' }
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([], [], {
        plans: [planOf(3)],
        edits: [{
          outcome: 'done',
          narration: 'Pose: soaring.',
          body: 'He soars.',
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

    const render = await readEvents(await call('POST', '/api/sessions/s1/frames/2/render'))
    assertEquals(render.at(-1)![0], 'rendered')
    assertEquals((await call('POST', '/api/sessions/s1/frames/9/render')).status, 404)

    const byHand = await (await call('PUT', '/api/sessions/s1/frames/2', { body: 'He lands.' }))
      .json()
    assertEquals([byHand.frames[2].body, byHand.frames[2].stale], ['He lands.', true])
    assertEquals((await call('PUT', '/api/sessions/s1/frames/0', { body: 'Nude.' })).status, 422)

    const look = await (await call('PUT', '/api/sessions/s1/look', newLook)).json()
    assertEquals(look.look, newLook)

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
      (await call('PUT', '/api/sessions/s1/look', { subject: 'a', style: 'b' })).status,
      409,
    )
    assertEquals((await call('POST', '/api/sessions/s2/frames', { action: 'x' })).status, 409)
    assertEquals((await call('DELETE', '/api/sessions/s2/frames/0')).status, 409)
    assertEquals(
      (await call('PUT', '/api/sessions/s2/look', { subject: 'a', style: 'b' })).status,
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

Deno.test('Upscaling keeps the original, flags every Frame showing that image, and runs once', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      imageGenerator: images,
      // The second Action changes nothing, so its Frame reuses the Opening's image.
      textModel: scriptedTextModel([reply('standing'), reply('standing'), reply('standing')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Stay' }))

    const events = await readEvents(await call('POST', '/api/sessions/s1/frames/1/upscale'))
    assertEquals(events.map(([e]) => e), ['phase', 'upscaled'])
    const [opening, second] = (events.at(-1)![1].session as {
      frames: { image: string; upscaled?: string }[]
    }).frames
    assertMatch(second.upscaled!, /^frame-0-[0-9a-f]{8}-2048\.png$/)
    assertEquals([opening.upscaled, second.image], [second.upscaled, opening.image])
    assertEquals(images.upscaled, [opening.image])
    assertEquals(images.upscalers, ['seedvr2-7b'])
    assertEquals((await call('GET', `/api/sessions/s1/images/${second.upscaled}`)).status, 200)

    assertEquals((await call('POST', '/api/sessions/s1/frames/0/upscale')).status, 409)
    assertEquals((await call('POST', '/api/sessions/s1/frames/7/upscale')).status, 404)

    // A Frame that reuses an upscaled image is upscaled too.
    const third = await readEvents(
      await call('POST', '/api/sessions/s1/frames', { action: 'Stay' }),
    )
    assertEquals((third.at(-1)![1].frame as { upscaled?: string }).upscaled, second.upscaled)
  }))

Deno.test('A failed upscale leaves the Frame as it was', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      imageGenerator: images,
      textModel: scriptedTextModel([reply('standing')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    images.upscale = () => Promise.reject(new Error('SeedVR2 upscaler failed: out of memory'))
    const events = await readEvents(await call('POST', '/api/sessions/s1/frames/0/upscale'))
    assertEquals(events.at(-1)![1].message, 'SeedVR2 upscaler failed: out of memory')
    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(session.frames[0].upscaled, undefined)
    assertEquals(session.activity, null)
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
    assertEquals((await call('POST', '/api/sessions/s1/frames/0/upscale')).status, 409)

    await readEvents(await call('POST', '/api/sessions/s1/frames/0/render'))
    const up = await readEvents(await call('POST', '/api/sessions/s1/frames/0/upscale'))
    const upscaled = (up.at(-1)![1].session as { frames: { upscaled?: string }[] }).frames[0]
      .upscaled!
    assertMatch(upscaled, /-2048\.png$/)

    const rerender = await readEvents(await call('POST', '/api/sessions/s1/frames/0/render'))
    assertEquals((rerender.at(-1)![1].frame as { upscaled?: string }).upscaled, undefined)
    assertEquals((await call('GET', `/api/sessions/s1/images/${upscaled}`)).status, 404)
  }))

Deno.test('Upscale uses the upscaler chosen in Settings now, even mid-Session', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call, settings } = setup({
      root,
      settings: { textModel: 'x' },
      imageGenerator: images,
      textModel: scriptedTextModel([reply('standing')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    settings.current = { ...settings.current, upscaler: 'seedvr2-3b' }
    await readEvents(await call('POST', '/api/sessions/s1/frames/0/upscale'))
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

Deno.test('A Roleplay Frame is pictured over the API, and its Look can be edited', () =>
  withTempDir(async (root) => {
    const body = 'Mira waits. She frowns. A wide shot. A navy coat. The bridge. Lamplight. Blues.'
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      roleplayModel: scriptedRoleplayModel({
        casts: [testCast],
        replies: [replyOf('You are late.')],
        looks: [{ character: 'Mira Vance, 34.', persona: 'Sam Reyes, 25.', style: 'Ink.' }],
        bodies: [body],
      }),
    })
    await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    assertEquals((await call('PUT', '/api/sessions/s1/roleplay/look', {})).status, 409)
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin'))

    const events = await readEvents(
      await call('POST', '/api/sessions/s1/roleplay/frames/0/picture'),
    )
    assertEquals(events.map(([e]) => e), ['phase', 'look', 'pictured'])
    assertEquals((await call('POST', '/api/sessions/s1/roleplay/frames/5/picture')).status, 404)

    const look = await call('PUT', '/api/sessions/s1/roleplay/look', {
      character: 'Mira Vance, 34.',
      persona: 'Sam Reyes, 25.',
      style: 'Watercolour.',
    })
    const session = await look.json()
    assertEquals(
      session.frames[0].promptText,
      `adult, Mira Vance, 34. Sam Reyes, 25. ${body} Watercolour.`,
    )
    assertEquals(
      (await call('PUT', '/api/sessions/s1/roleplay/look', { subject: 'x' })).status,
      400,
    )
  }))
