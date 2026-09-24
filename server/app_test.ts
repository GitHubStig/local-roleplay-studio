import { assertEquals } from '@std/assert'
import { createHandler } from './app.ts'
import { parseScenario, type ScenarioLibrary } from './scenario.ts'
import { DEFAULT_SETTINGS, type Settings, type SettingsStore } from './settings.ts'

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

const scenarioText = `---
title: Test Shoot
description: A short test.
imagePrefix: studio photo
setup: { location: a studio }
sceneSchema: { type: object }
---
## System
Rules.
## Opening
Start.
`

const scenarios: ScenarioLibrary = {
  list: () =>
    Promise.resolve({
      scenarios: [parseScenario('test', scenarioText)],
      errors: [{ file: 'broken.md', message: 'title must be a non-empty string' }],
    }),
  get: () => Promise.resolve(undefined),
}

function setup(listTextModels = () => Promise.resolve(['llama3:latest'])) {
  const settings = memoryStore()
  return { settings, handler: createHandler({ settings, listTextModels, scenarios }) }
}

const put = (body: unknown) =>
  new Request('http://localhost/api/settings', {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

Deno.test('GET /api/health reports ok', async () => {
  const res = await setup().handler(new Request('http://localhost/api/health'))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { ok: true })
})

Deno.test('unknown routes return 404', async () => {
  const res = await setup().handler(new Request('http://localhost/api/nope'))
  assertEquals(res.status, 404)
})

Deno.test('GET /api/settings returns stored settings', async () => {
  const res = await setup().handler(new Request('http://localhost/api/settings'))
  assertEquals(await res.json(), DEFAULT_SETTINGS)
})

Deno.test('PUT /api/settings saves valid settings', async () => {
  const { settings, handler } = setup()
  const next = { ...DEFAULT_SETTINGS, textModel: 'llama3:latest', steps: 12, quantize: 8 as const }
  const res = await handler(put(next))
  assertEquals(res.status, 200)
  assertEquals(settings.current, next)
})

Deno.test('PUT /api/settings rejects invalid settings without saving', async () => {
  const { settings, handler } = setup()
  const res = await handler(put({ ...DEFAULT_SETTINGS, imageModel: 'nope', steps: 0 }))
  assertEquals(res.status, 400)
  const body = await res.json()
  assertEquals(body.issues.length, 2)
  assertEquals(settings.current, DEFAULT_SETTINGS)
})

Deno.test('PUT /api/settings rejects a non-JSON body', async () => {
  const res = await setup().handler(put('not json'))
  assertEquals(res.status, 400)
})

Deno.test('GET /api/settings/options lists Ollama and image models', async () => {
  const res = await setup().handler(new Request('http://localhost/api/settings/options'))
  const body = await res.json()
  assertEquals(body.textModels, ['llama3:latest'])
  assertEquals(body.textModelsError, undefined)
  assertEquals(body.imageModels[0].id, 'z-image-turbo')
})

Deno.test('GET /api/settings/options still answers when Ollama is down', async () => {
  const { handler } = setup(() => Promise.reject(new Error('connection refused')))
  const res = await handler(new Request('http://localhost/api/settings/options'))
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.textModels, [])
  assertEquals(body.textModelsError, 'Could not reach Ollama: connection refused')
})

Deno.test('GET /api/scenarios lists summaries and load errors', async () => {
  const res = await setup().handler(new Request('http://localhost/api/scenarios'))
  assertEquals(await res.json(), {
    scenarios: [{ id: 'test', title: 'Test Shoot', description: 'A short test.' }],
    errors: [{ file: 'broken.md', message: 'title must be a non-empty string' }],
  })
})
