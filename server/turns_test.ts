import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { DEFAULT_SETTINGS } from './settings.ts'
import { dirSessionStore, type Session } from './session.ts'
import {
  fakeImageGenerator,
  reply,
  scriptedTextModel,
  testScenario,
  withTempDir,
} from './testing.ts'
import { runTurn, sceneToPrompt, type TurnEvent } from './turns.ts'

const newSession = (): Session => ({
  id: 's1',
  scenarioId: 'test',
  settings: { ...DEFAULT_SETTINGS, textModel: 'fake' },
  seed: 7,
  status: 'active',
  createdAt: '2026-09-24T00:00:00.000Z',
  turns: [],
})

const signal = () => new AbortController().signal

Deno.test('runTurn commits the Opening Turn with prefixed image prompt', () =>
  withTempDir(async (root) => {
    const store = dirSessionStore(root)
    const images = fakeImageGenerator()
    const session = newSession()
    const events: TurnEvent[] = []
    const turn = await runTurn(
      { store, textModel: scriptedTextModel([reply('standing')]), imageGenerator: images },
      session,
      testScenario,
      null,
      (e) => events.push(e),
      signal(),
    )
    assertEquals(turn.index, 0)
    assertEquals(turn.image, 'turn-0.png')
    assertEquals(images.prompts, ['studio photo, pose: standing'])
    assertEquals(events.map((e) => e.type), ['phase', 'text', 'phase', 'committed'])
    assertEquals((await store.load('s1'))?.turns.length, 1)
  }))

Deno.test('runTurn retries a failed Text Model reply once', () =>
  withTempDir(async (root) => {
    const textModel = scriptedTextModel([new Error('bad JSON'), reply('standing')])
    const turn = await runTurn(
      { store: dirSessionStore(root), textModel, imageGenerator: fakeImageGenerator() },
      newSession(),
      testScenario,
      null,
      () => {},
      signal(),
    )
    assertEquals(textModel.calls, 2)
    assertEquals(turn.scene, { pose: 'standing' })
  }))

Deno.test('runTurn gives up after the retry and leaves the Session untouched', () =>
  withTempDir(async (root) => {
    const store = dirSessionStore(root)
    const session = newSession()
    await store.save(session)
    await assertRejects(
      () =>
        runTurn(
          {
            store,
            textModel: scriptedTextModel([new Error('one'), new Error('two')]),
            imageGenerator: fakeImageGenerator(),
          },
          session,
          testScenario,
          null,
          () => {},
          signal(),
        ),
      Error,
      'two',
    )
    assertEquals((await store.load('s1'))?.turns, [])
  }))

Deno.test('runTurn keeps the previous Scene and image when a Direction is declined', () =>
  withTempDir(async (root) => {
    const store = dirSessionStore(root)
    const images = fakeImageGenerator()
    const session = newSession()
    const textModel = scriptedTextModel([
      reply('standing'),
      reply('something else', { declined: true, narration: 'She declines.' }),
    ])
    const deps = { store, textModel, imageGenerator: images }
    await runTurn(deps, session, testScenario, null, () => {}, signal())
    const turn = await runTurn(
      deps,
      session,
      testScenario,
      'Take off the jacket',
      () => {},
      signal(),
    )
    assertEquals(turn.declined, true)
    assertEquals(turn.scene, { pose: 'standing' })
    assertEquals(turn.image, 'turn-0.png')
    assertEquals(turn.narration, 'She declines.')
    assertEquals(images.prompts.length, 1)
  }))

Deno.test('runTurn rolls back when the image fails', () =>
  withTempDir(async (root) => {
    const store = dirSessionStore(root)
    const session = newSession()
    await store.save(session)
    await assertRejects(
      () =>
        runTurn(
          {
            store,
            textModel: scriptedTextModel([reply('standing')]),
            imageGenerator: fakeImageGenerator({ fail: true }),
          },
          session,
          testScenario,
          null,
          () => {},
          signal(),
        ),
      Error,
      'mflux crashed',
    )
    assertEquals(session.turns, [])
    assertEquals((await store.load('s1'))?.turns, [])
  }))

Deno.test('runTurn aborted mid-image removes nothing committed', () =>
  withTempDir(async (root) => {
    const store = dirSessionStore(root)
    const session = newSession()
    await store.save(session)
    const controller = new AbortController()
    const run = runTurn(
      {
        store,
        textModel: scriptedTextModel([reply('standing')]),
        imageGenerator: fakeImageGenerator({ hang: true }),
      },
      session,
      testScenario,
      null,
      (e) => {
        if (e.type === 'phase' && e.phase === 'image') queueMicrotask(() => controller.abort())
      },
      controller.signal,
    )
    await assertRejects(() => run)
    assertEquals((await store.load('s1'))?.turns, [])
    const files = await Array.fromAsync(Deno.readDir(join(root, 's1')))
    assertEquals(files.map((f) => f.name), ['session.json'])
  }))

Deno.test('sceneToPrompt labels nested fields and skips empty ones', () => {
  assertEquals(
    sceneToPrompt({
      subject: { pose: 'crouched low', expression: '' },
      camera: { angle: 'low' },
      set: { backdrop: 'burnt orange', props: ['stool', ''] },
      lighting: { extras: [] },
    }),
    'subject pose: crouched low, camera angle: low, set backdrop: burnt orange, set props: stool',
  )
})
