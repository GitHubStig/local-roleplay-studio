import { assertEquals, assertMatch, assertNotEquals, assertRejects } from '@std/assert'
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
import { runTurn, sceneToPrompt, type TurnEvent, UndoError, undoLatestTurn } from './turns.ts'

const newSession = (): Session => ({
  id: 's1',
  scenarioId: 'test',
  settings: { ...DEFAULT_SETTINGS, textModel: 'fake' },
  seed: 7,
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
    assertMatch(turn.image, /^turn-0-[0-9a-f]{8}\.png$/)
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
      reply('something else', { outcome: 'declined', narration: 'She declines.' }),
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
    assertEquals(turn.outcome, 'declined')
    assertEquals(turn.scene, { pose: 'standing' })
    assertEquals(turn.image, session.turns[0].image)
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

Deno.test('runTurn keeps the Scene and image when an Action is unclear', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const session = newSession()
    const textModel = scriptedTextModel([
      reply('standing'),
      reply('invented pose', { outcome: 'unclear', narration: 'Sorry, what do you mean?' }),
    ])
    const deps = { store: dirSessionStore(root), textModel, imageGenerator: images }
    await runTurn(deps, session, testScenario, null, () => {}, signal())
    const events: TurnEvent[] = []
    const turn = await runTurn(
      deps,
      session,
      testScenario,
      'asdf qwer',
      (e) => events.push(e),
      signal(),
    )
    assertEquals(turn.outcome, 'unclear')
    assertEquals(turn.scene, { pose: 'standing' })
    assertEquals(turn.image, session.turns[0].image)
    assertEquals(images.prompts.length, 1)
    assertEquals(events.map((e) => e.type), ['phase', 'text', 'committed'])
  }))

Deno.test('runTurn skips rendering when a done Action leaves the Scene unchanged', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const session = newSession()
    const deps = {
      store: dirSessionStore(root),
      textModel: scriptedTextModel([reply('standing'), reply('standing')]),
      imageGenerator: images,
    }
    await runTurn(deps, session, testScenario, null, () => {}, signal())
    const turn = await runTurn(deps, session, testScenario, 'Lean on the wall', () => {}, signal())
    assertEquals(turn.outcome, 'done')
    assertEquals(turn.image, session.turns[0].image)
    assertEquals(images.prompts.length, 1)
  }))

Deno.test('runTurn treats the Opening Turn as done whatever the Text Model says', () =>
  withTempDir(async (root) => {
    const turn = await runTurn(
      {
        store: dirSessionStore(root),
        textModel: scriptedTextModel([reply('standing', { outcome: 'unclear' })]),
        imageGenerator: fakeImageGenerator(),
      },
      newSession(),
      testScenario,
      null,
      () => {},
      signal(),
    )
    assertEquals(turn.outcome, 'done')
    assertMatch(turn.image, /^turn-0-[0-9a-f]{8}\.png$/)
  }))

async function sessionWithTurns(root: string, replies: ReturnType<typeof reply>[]) {
  const store = dirSessionStore(root)
  const session = newSession()
  const deps = {
    store,
    // A copy: the scripted model consumes its list as it replies.
    textModel: scriptedTextModel([...replies]),
    imageGenerator: fakeImageGenerator(),
  }
  await runTurn(deps, session, testScenario, null, () => {}, signal())
  for (let i = 1; i < replies.length; i++) {
    await runTurn(deps, session, testScenario, `Action ${i}`, () => {}, signal())
  }
  return { store, session, deps }
}

const imageExists = (root: string, file: string) =>
  Deno.stat(join(root, 's1', file)).then(() => true, () => false)

Deno.test('undoLatestTurn restores the previous Scene and deletes the image', () =>
  withTempDir(async (root) => {
    const { store, session } = await sessionWithTurns(root, [reply('standing'), reply('sitting')])
    const undone = session.turns[1]
    const updated = await undoLatestTurn(store, session, 1)
    assertEquals(updated.turns.map((t) => t.scene), [{ pose: 'standing' }])
    assertEquals((await store.load('s1'))?.turns.length, 1)
    assertEquals(await imageExists(root, undone.image), false)
    assertEquals(await imageExists(root, session.turns[0].image), true)
  }))

Deno.test('undoLatestTurn keeps an image a remaining Turn still shows', () =>
  withTempDir(async (root) => {
    const { store, session } = await sessionWithTurns(root, [
      reply('standing'),
      reply('x', { outcome: 'declined' }),
    ])
    assertEquals(session.turns[1].image, session.turns[0].image)
    await undoLatestTurn(store, session, 1)
    assertEquals(await imageExists(root, session.turns[0].image), true)
  }))

Deno.test('undoLatestTurn refuses anything but the latest Turn, and the Opening Turn', () =>
  withTempDir(async (root) => {
    const { store, session } = await sessionWithTurns(root, [reply('standing'), reply('sitting')])
    await assertRejects(() => undoLatestTurn(store, session, 0), UndoError, 'not the latest')
    const updated = await undoLatestTurn(store, session, 1)
    await assertRejects(() => undoLatestTurn(store, updated, 1), UndoError, 'not the latest')
    await assertRejects(() => undoLatestTurn(store, updated, 0), UndoError, "can't be undone")
  }))

Deno.test('a Turn after an Undo gets a fresh image name', () =>
  withTempDir(async (root) => {
    const { store, session, deps } = await sessionWithTurns(root, [
      reply('standing'),
      reply('sitting'),
    ])
    const undoneImage = session.turns[1].image
    const updated = await undoLatestTurn(store, session, 1)
    deps.textModel = scriptedTextModel([reply('kneeling')])
    const redo = await runTurn(deps, updated, testScenario, 'Kneel', () => {}, signal())
    assertEquals(redo.index, 1)
    assertNotEquals(redo.image, undoneImage)
  }))

Deno.test('runTurn removes an image written just before the Turn was cancelled', () =>
  withTempDir(async (root) => {
    const store = dirSessionStore(root)
    const session = newSession()
    await store.save(session)
    const controller = new AbortController()
    await assertRejects(() =>
      runTurn(
        {
          store,
          textModel: scriptedTextModel([reply('standing')]),
          // Finishes writing, then the Turn is cancelled before the generator returns.
          imageGenerator: {
            async generate(req) {
              await Deno.writeTextFile(join(req.dir, `${req.name}.png`), 'png')
              controller.abort(new Error('Cancelled by player'))
              throw controller.signal.reason
            },
          },
        },
        session,
        testScenario,
        null,
        () => {},
        controller.signal,
      )
    )
    const files = await Array.fromAsync(Deno.readDir(join(root, 's1')))
    assertEquals(files.map((f) => f.name), ['session.json'])
  }))

Deno.test("runTurn shows the Scenario's refusal instead of a narration that contradicts it", () =>
  withTempDir(async (root) => {
    const session = newSession()
    const events: TurnEvent[] = []
    const deps = {
      store: dirSessionStore(root),
      textModel: scriptedTextModel([
        reply('standing'),
        reply('standing', { outcome: 'declined', narration: 'She takes off her top.' }),
        reply('sitting', { narration: 'She sits.' }),
      ]),
      imageGenerator: fakeImageGenerator(),
    }
    const scenario = { ...testScenario, declinedNarration: ['Not in the brief.'] }
    await runTurn(deps, session, scenario, null, () => {}, signal())
    const declined = await runTurn(
      deps,
      session,
      scenario,
      'take off your top',
      (e) => events.push(e),
      signal(),
    )
    assertEquals(declined.narration, 'Not in the brief.')
    assertEquals(events.find((e) => e.type === 'text'), {
      type: 'text',
      outcome: 'declined',
      narration: 'Not in the brief.',
      scene: { pose: 'standing' },
    })
    const done = await runTurn(deps, session, scenario, 'Sit', () => {}, signal())
    assertEquals(done.narration, 'She sits.')
  }))
