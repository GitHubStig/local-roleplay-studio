import { assertEquals, assertMatch, assertStringIncludes } from '@std/assert'
import type { Backend } from './backends.ts'
import { DEFAULT_SETTINGS } from './settings.ts'
import { fakeImageGenerator, reply, scriptedTextModel, withTempDir } from './testing.ts'
import { type JsonFrame, readEvents, setup } from './appTesting.ts'

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
  assertEquals(await res.json(), { ...DEFAULT_SETTINGS, apiKeysSet: [] })
})

/** Settings with OpenRouter listed, as the Text Model's Backend. */
const withOpenRouter = {
  ...DEFAULT_SETTINGS,
  backends: [
    ...DEFAULT_SETTINGS.backends,
    { id: 'openrouter', kind: 'openai', address: 'https://openrouter.ai/api/v1' },
  ],
  runOn: { ...DEFAULT_SETTINGS.runOn, text: 'openrouter' },
}

Deno.test("A Backend's API key is saved apart from Settings, and never sent back", async () => {
  const { settings, call } = setup()
  const next = { ...withOpenRouter, apiKeys: { openrouter: ' sk-secret ', nowhere: 'sk-lost' } }
  const saved = await (await call('PUT', '/api/settings', next)).json()
  // Only for a Backend that's listed.
  assertEquals(settings.apiKeys, { openrouter: 'sk-secret' })
  assertEquals('apiKeys' in settings.current, false)
  assertEquals(saved.apiKeysSet, ['openrouter'])
  assertEquals(JSON.stringify(saved).includes('sk-secret'), false)
  assertEquals(
    JSON.stringify(await (await call('GET', '/api/settings')).json()).includes('sk-secret'),
    false,
  )

  // Left out, the key is kept; '' removes it.
  await call('PUT', '/api/settings', withOpenRouter)
  assertEquals(settings.apiKeys.openrouter, 'sk-secret')
  await call('PUT', '/api/settings', { ...withOpenRouter, apiKeys: { openrouter: '' } })
  assertEquals(settings.apiKeys.openrouter, '')
})

Deno.test('An OpenAI-compatible server needs an address', async () => {
  const res = await setup().call('PUT', '/api/settings', {
    ...withOpenRouter,
    backends: [...DEFAULT_SETTINGS.backends, { id: 'lm', kind: 'openai', address: '' }],
    runOn: DEFAULT_SETTINGS.runOn,
  })
  assertEquals(res.status, 400)
})

Deno.test('Each kind of work is sent to a listed Backend that can do it', async () => {
  const { call } = setup()
  const issues = async (runOn: object) =>
    (await (await call('PUT', '/api/settings', {
      ...DEFAULT_SETTINGS,
      runOn: { ...DEFAULT_SETTINGS.runOn, ...runOn },
    })).json()).issues
  assertEquals(await issues({ images: 'pc' }), ['runOn.images must be a Backend that can do it'])
  assertEquals(await issues({ text: 'here' }), ['runOn.text must be a Backend that can do it'])
  assertEquals(await issues({ voices: 'ollama' }), [
    'runOn.voices must be a Backend that can do it',
  ])
})

Deno.test('POST /api/settings/text-models lists a Backend not saved yet', async () => {
  const asked: [Backend, string | undefined][] = []
  const { call } = setup({
    listTextModels: (backend, apiKey) => {
      asked.push([backend, apiKey])
      return Promise.reject(new Error('401 Unauthorized'))
    },
  })
  const body = await (await call('POST', '/api/settings/text-models', {
    id: 'lm',
    kind: 'openai',
    address: ' http://localhost:1234/v1 ',
    apiKey: 'sk-new',
  })).json()
  assertEquals(asked, [[
    { id: 'lm', kind: 'openai', address: 'http://localhost:1234/v1' },
    'sk-new',
  ]])
  assertEquals(body.textModels, [])
  assertEquals(body.textModelsError, 'Could not reach OpenAI-compatible server: 401 Unauthorized')
  const bad = await call('POST', '/api/settings/text-models', { kind: 'comfyui', address: '' })
  assertEquals(bad.status, 400)
})

Deno.test("A POST that isn't JSON is refused, as another site could send it", async () => {
  let listed = false
  const { handler } = setup({
    listTextModels: () => {
      listed = true
      return Promise.resolve([])
    },
  })
  const res = await handler(
    new Request('http://localhost/api/settings/text-models', {
      method: 'POST',
      // What a page on another site can send without a preflight.
      body: JSON.stringify({ kind: 'openai', address: 'http://elsewhere/v1' }),
    }),
  )
  assertEquals([res.status, (await res.json()).error, listed], [415, 'Send JSON', false])
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
  // Where each model's renders go now: here on mflux, with no ComfyUI listed.
  assertEquals(body.imageModelsOn['qwen-image-2.1'], 'mflux')
  // And each edit model's: FLUX.3 Klein Edit runs only on ComfyUI, and none is listed.
  assertEquals(body.editModelsOn, { 'qwen-image-2.1-edit': 'mflux' })
  assertEquals(body.imageModels.comfyui.map((m: { id: string }) => m.id), [
    'qwen-image-2.1',
    'qwen-image-2.1-turbo',
    'flux2-klein-4b',
    'flux3-klein',
    'ming-image',
    'moss-image',
    'fibo-2.0',
    'fibo-2.0-turbo',
    'z-image-turbo',
  ])
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
    address: ' http://192.0.2.20:8188 ',
    imageModel: 'qwen-image-2.1',
  })
  assertEquals((await res.json()).device, 'cuda:0 NVIDIA GeForce RTX 4070')
  // A Mac rendering with mflux checks only the upscaler it sends there.
  await call('POST', '/api/settings/comfyui', {
    address: 'http://192.0.2.20:8188',
    upscaler: 'seedvr2-7b',
  })
  assertEquals(asked, [
    ['http://192.0.2.20:8188', {
      imageModel: 'qwen-image-2.1',
      upscaler: undefined,
      voices: undefined,
    }],
    ['http://192.0.2.20:8188', {
      imageModel: undefined,
      upscaler: 'seedvr2-7b',
      voices: undefined,
    }],
  ])
})

Deno.test('Adding a ComfyUI makes pictures, Upscale, voices and clips available where mflux is not', async () => {
  const off = { available: false, reason: 'mflux runs only on Apple Silicon Macs' }
  const on = { available: true }
  const { call } = setup({
    features: {
      images: off,
      upscale: off,
      edits: off,
      voices: off,
      scenes: on,
      figures: on,
      lito: off,
      style: off,
      video: off,
    },
  })
  const before = (await (await call('GET', '/api/settings/options')).json()).features
  for (const extra of ['images', 'upscale', 'edits', 'voices', 'video']) {
    assertEquals(before[extra].available, false)
    assertStringIncludes(before[extra].reason, 'or add a ComfyUI in Settings')
  }
  const settings = await (await call('GET', '/api/settings')).json()
  const saved = await call('PUT', '/api/settings', {
    ...settings,
    backends: [...settings.backends, { id: 'pc', kind: 'comfyui', address: '' }],
    runOn: { ...settings.runOn, images: 'pc' },
    imageBackend: 'comfyui',
    imageModel: 'qwen-image-2.1',
  })
  assertEquals(saved.status, 200)
  const after = (await (await call('GET', '/api/settings/options')).json()).features
  for (const extra of ['images', 'upscale', 'edits', 'voices', 'video']) {
    assertEquals(after[extra].available, true)
  }
  // An Image Model must be one some backend has.
  const wrong = await call('PUT', '/api/settings', { ...settings, imageModel: 'dall-e' })
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

Deno.test('POST /api/sessions takes a seed of its own over Settings', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x', seedMode: 'fixed', seed: 99 },
    })
    const create = (seed: unknown) => call('POST', '/api/sessions', { scenarioId: 'test', seed })
    assertEquals((await (await create(7)).json()).seed, 7)
    assertEquals((await (await create(0)).json()).seed, 0)
    assertEquals((await create(-1)).status, 400)
    assertEquals((await create(1.5)).status, 400)
    assertEquals((await create('7')).status, 400)
    assertEquals((await create(2 ** 32)).status, 400)
  }))

Deno.test('POST /api/sessions refuses without a Text Model or a known Scenario', async () => {
  assertEquals((await setup().call('POST', '/api/sessions', { scenarioId: 'test' })).status, 400)
  const { call } = setup({ settings: { textModel: 'x' } })
  assertEquals((await call('POST', '/api/sessions', { scenarioId: 'nope' })).status, 404)
  assertEquals((await call('POST', '/api/sessions', {})).status, 400)
})

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
    // A Session on its own carries its title too, for the screen's tab.
    assertEquals((await (await call('GET', '/api/sessions/s1')).json()).title, 'Test Shoot')
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
    assertEquals((await call('POST', '/api/sessions', { brief: 'a child on a swing' })).status, 201)
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
      features: {
        images: off,
        upscale: off,
        edits: off,
        voices: off,
        scenes: off,
        figures: off,
        lito: off,
        style: off,
        video: off,
      },
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

Deno.test('Turning the Limits off in Settings disables all Limits at once', () =>
  withTempDir(async (root) => {
    const { call, settings } = setup({ root, settings: { textModel: 'x' } })
    try {
      settings.current = { ...settings.current, limits: false }
      const nude = await call('POST', '/api/sessions', { brief: 'A nude figure study.' })
      assertEquals(nude.status, 201)
      const young = await call('POST', '/api/sessions', { brief: 'A fifteen-year-old runner.' })
      assertEquals(young.status, 201)
    } finally {
      settings.current = { ...settings.current, limits: true }
      await call('GET', '/api/sessions')
    }
    assertEquals(
      (await call('POST', '/api/sessions', { brief: 'A nude figure study.' })).status,
      422,
    )
  }))
