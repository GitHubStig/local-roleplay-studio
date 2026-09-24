import { assertEquals, assertMatch, assertNotEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { DEFAULT_SETTINGS } from './settings.ts'
import { dirSessionStore, type Session } from './session.ts'
import {
  fakeImageGenerator,
  promptWith,
  reply,
  scriptedTextModel,
  testScenario,
  withTempDir,
} from './testing.ts'
import { runTurn, type TurnEvent, UndoError, undoLatestTurn } from './turns.ts'
import { RenderQueue } from './renderQueue.ts'
import { renderPrompt } from './imagePrompt.ts'

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
    assertEquals(images.prompts, [renderPrompt(promptWith('standing'))])
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
    assertEquals(turn.prompt, promptWith('standing'))
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
    assertEquals(turn.prompt, promptWith('standing'))
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
    assertEquals(turn.prompt, promptWith('standing'))
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
    assertEquals(updated.turns.map((t) => t.prompt), [promptWith('standing')])
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

async function openedSession(
  root: string,
  replies: ReturnType<typeof reply>[],
  realPeople: string[] = [],
) {
  const session = newSession()
  const textModel = scriptedTextModel([reply('standing'), ...replies], realPeople)
  const images = fakeImageGenerator()
  const deps = { store: dirSessionStore(root), textModel, imageGenerator: images }
  await runTurn(deps, session, testScenario, null, () => {}, signal())
  return { session, textModel, images, deps }
}

Deno.test('runTurn declines an Action that crosses a limit without asking the Text Model', () =>
  withTempDir(async (root) => {
    const { session, textModel, images, deps } = await openedSession(root, [])
    const turn = await runTurn(deps, session, testScenario, 'make her topless', () => {}, signal())
    assertEquals(turn.outcome, 'declined')
    assertEquals(turn.narration, 'Declined: no sexual or nude imagery.')
    assertEquals(turn.prompt, promptWith('standing'))
    assertEquals(textModel.calls, 1) // the Opening Turn only
    assertEquals(images.prompts.length, 1)
  }))

Deno.test('runTurn declines a prompt the Text Model wrote across a limit', () =>
  withTempDir(async (root) => {
    const { session, deps } = await openedSession(root, [
      reply('kneeling', { prompt: `${promptWith('kneeling')} She is a 15 year old girl.` }),
    ])
    const turn = await runTurn(deps, session, testScenario, 'make her younger', () => {}, signal())
    assertEquals(turn.outcome, 'declined')
    assertEquals(turn.narration, 'Declined: everyone depicted must be an adult.')
    assertEquals(turn.prompt, promptWith('standing'))
    assertEquals(turn.image, session.turns[0].image)
  }))

Deno.test('runTurn fails an Opening Turn whose prompt crosses a limit', () =>
  withTempDir(async (root) => {
    await assertRejects(
      () =>
        runTurn(
          {
            store: dirSessionStore(root),
            textModel: scriptedTextModel([
              reply('x', { prompt: `${promptWith('x')} Wearing lingerie.` }),
            ]),
            imageGenerator: fakeImageGenerator(),
          },
          newSession(),
          testScenario,
          null,
          () => {},
          signal(),
        ),
      Error,
      'crossed a limit: no sexual or nude imagery',
    )
  }))

Deno.test('runTurn asks about real people only when an Action might name one', () =>
  withTempDir(async (root) => {
    const { session, textModel, deps } = await openedSession(
      root,
      [reply('crouching')],
      ['Serena Williams'],
    )
    const declined = await runTurn(
      deps,
      session,
      testScenario,
      'make her look like Serena Williams',
      () => {},
      signal(),
    )
    assertEquals(declined.outcome, 'declined')
    assertEquals(declined.narration, 'Declined: no real, identifiable people.')
    const done = await runTurn(deps, session, testScenario, 'crouch low', () => {}, signal())
    assertEquals(done.outcome, 'done')
    assertEquals(textModel.personChecks, ['make her look like Serena Williams'])
  }))

Deno.test("runTurn streams the Text Model's thinking and saves it with the Turn", () =>
  withTempDir(async (root) => {
    const events: TurnEvent[] = []
    const turn = await runTurn(
      {
        store: dirSessionStore(root),
        textModel: scriptedTextModel([reply('standing', { thinking: 'She should stand. Done.' })]),
        imageGenerator: fakeImageGenerator(),
      },
      newSession(),
      testScenario,
      null,
      (e) => events.push(e),
      signal(),
    )
    const thinking = events.filter((e) => e.type === 'thinking')
    assertEquals(
      thinking.map((e) => e.type === 'thinking' && e.text).join(''),
      'She should stand. Done.',
    )
    assertEquals(turn.thinking, 'She should stand. Done.')
  }))

Deno.test('runTurn marks thinking from a retry as a restart, and saves no thinking when off', () =>
  withTempDir(async (root) => {
    const events: TurnEvent[] = []
    const session = newSession()
    const deps = {
      store: dirSessionStore(root),
      textModel: scriptedTextModel([
        new Error('bad JSON'),
        reply('standing', { thinking: 'Second try.' }),
        reply('sitting'),
      ]),
      imageGenerator: fakeImageGenerator(),
    }
    // The failed first attempt streamed nothing here, but the retry's first chunk says restart.
    await runTurn(deps, session, testScenario, null, (e) => events.push(e), signal())
    const first = events.find((e) => e.type === 'thinking')
    assertEquals(first, { type: 'thinking', text: 'Second ', restart: true })
    const plain = await runTurn(deps, session, testScenario, 'Sit', () => {}, signal())
    assertEquals('thinking' in plain, false)
  }))

Deno.test('runTurn records how long the text and image steps took', () =>
  withTempDir(async (root) => {
    const session = newSession()
    const images = fakeImageGenerator()
    const deps = {
      store: dirSessionStore(root),
      textModel: scriptedTextModel([reply('standing'), reply('standing')]),
      imageGenerator: {
        async generate(...args: Parameters<typeof images.generate>) {
          await new Promise((r) => setTimeout(r, 120))
          return images.generate(...args)
        },
      },
    }
    const opening = await runTurn(deps, session, testScenario, null, () => {}, signal())
    assertEquals(typeof opening.timings!.text, 'number')
    assertEquals(opening.timings!.image! >= 0.1, true)
    assertEquals('queued' in opening.timings!, false)

    // Nothing changed, so the image is reused: no image time.
    const reused = await runTurn(deps, session, testScenario, 'Stay', () => {}, signal())
    assertEquals(reused.timings!.image, null)
  }))

Deno.test('runTurn records time spent waiting for another render', () =>
  withTempDir(async (root) => {
    const queue = new RenderQueue()
    const release = await queue.acquire(new AbortController().signal)
    setTimeout(release, 150)
    const turn = await runTurn(
      {
        store: dirSessionStore(root),
        textModel: scriptedTextModel([reply('standing')]),
        imageGenerator: fakeImageGenerator(),
        renderQueue: queue,
      },
      newSession(),
      testScenario,
      null,
      () => {},
      signal(),
    )
    assertEquals(turn.timings!.queued! >= 0.1, true)
  }))
