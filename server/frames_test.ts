import { assertEquals, assertMatch, assertNotEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { DEFAULT_SETTINGS } from './settings.ts'
import { type ChainSession, dirSessionStore, type SessionStore } from './session.ts'
import {
  fakeImageGenerator,
  promptWith,
  reply,
  scriptedTextModel,
  testScenario,
  withTempDir,
} from './testing.ts'
import {
  type FrameEvent,
  imageProgress,
  type ProgressEvent,
  runChainFrame,
  UndoError,
  undoLatestFrame,
  upscaleFrame,
} from './frames.ts'
import { RenderQueue } from './renderQueue.ts'
import { renderPrompt } from './imagePrompt.ts'

const newSession = (): ChainSession => ({
  id: 's1',
  kind: 'chain',
  brief: null,
  scenarioId: 'test',
  settings: { ...DEFAULT_SETTINGS, textModel: 'fake' },
  seed: 7,
  createdAt: '2026-09-24T00:00:00.000Z',
  frames: [],
})

const signal = () => new AbortController().signal

/** A store already holding the fresh Chain `s1`, as the app's does before its first Frame. */
const chainStore = (root: string): SessionStore => {
  const store = dirSessionStore(root)
  return {
    ...store,
    load: async (id) => (await store.load(id)) ?? (id === 's1' ? newSession() : undefined),
  }
}

Deno.test('runChainFrame commits the Opening Frame with prefixed image prompt', () =>
  withTempDir(async (root) => {
    const store = chainStore(root)
    const images = fakeImageGenerator()
    const session = newSession()
    const events: FrameEvent[] = []
    const frame = await runChainFrame(
      { store, textModel: scriptedTextModel([reply('standing')]), imageGenerator: images },
      session,
      testScenario,
      null,
      (e) => events.push(e),
      signal(),
    )
    assertEquals(frame!.index, 0)
    assertMatch(frame!.image, /^frame-0-[0-9a-f]{8}\.png$/)
    assertEquals(images.prompts, [renderPrompt(promptWith('standing'))])
    assertEquals(events.map((e) => e.type), ['phase', 'text', 'phase', 'committed'])
    assertEquals((await store.load('s1'))?.frames.length, 1)
  }))

Deno.test('runChainFrame retries a failed Text Model reply once', () =>
  withTempDir(async (root) => {
    const textModel = scriptedTextModel([new Error('bad JSON'), reply('standing')])
    const frame = await runChainFrame(
      { store: chainStore(root), textModel, imageGenerator: fakeImageGenerator() },
      newSession(),
      testScenario,
      null,
      () => {},
      signal(),
    )
    assertEquals(textModel.calls, 2)
    assertEquals(frame!.prompt, promptWith('standing'))
  }))

Deno.test('runChainFrame gives up after the retry and leaves the Session untouched', () =>
  withTempDir(async (root) => {
    const store = chainStore(root)
    const session = newSession()
    await store.save(session)
    await assertRejects(
      () =>
        runChainFrame(
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
    assertEquals((await store.load('s1'))?.frames, [])
  }))

Deno.test('runChainFrame saves no Frame when the Text Model declines, and says why', () =>
  withTempDir(async (root) => {
    const store = chainStore(root)
    const images = fakeImageGenerator()
    const session = newSession()
    const textModel = scriptedTextModel([
      reply('standing'),
      reply('something else', { outcome: 'declined', narration: 'She declines.' }),
    ])
    const deps = { store, textModel, imageGenerator: images }
    await runChainFrame(deps, session, testScenario, null, () => {}, signal())
    const events: FrameEvent[] = []
    const frame = await runChainFrame(
      deps,
      session,
      testScenario,
      'Take off the jacket',
      (e) => events.push(e),
      signal(),
    )
    assertEquals(frame, null)
    assertEquals(events.at(-1), { type: 'declined', message: 'She declines.' })
    assertEquals(events.some((e) => e.type === 'text'), false)
    assertEquals(session.frames.length, 1)
    assertEquals((await store.load('s1'))?.frames.length, 1)
    assertEquals(images.prompts.length, 1)
  }))

Deno.test('runChainFrame rolls back when the image fails', () =>
  withTempDir(async (root) => {
    const store = chainStore(root)
    const session = newSession()
    await store.save(session)
    await assertRejects(
      () =>
        runChainFrame(
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
    assertEquals(session.frames, [])
    assertEquals((await store.load('s1'))?.frames, [])
  }))

Deno.test('runChainFrame aborted mid-image removes nothing committed', () =>
  withTempDir(async (root) => {
    const store = chainStore(root)
    const session = newSession()
    await store.save(session)
    const controller = new AbortController()
    const run = runChainFrame(
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
    assertEquals((await store.load('s1'))?.frames, [])
    const files = await Array.fromAsync(Deno.readDir(join(root, 's1')))
    assertEquals(files.map((f) => f.name), ['session.json'])
  }))

Deno.test('runChainFrame saves no Frame when an Action is unclear, and passes on the question', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const session = newSession()
    const textModel = scriptedTextModel([
      reply('standing'),
      reply('invented pose', { outcome: 'unclear', narration: 'Sorry, what do you mean?' }),
    ])
    const deps = { store: chainStore(root), textModel, imageGenerator: images }
    await runChainFrame(deps, session, testScenario, null, () => {}, signal())
    const events: FrameEvent[] = []
    const frame = await runChainFrame(
      deps,
      session,
      testScenario,
      'asdf qwer',
      (e) => events.push(e),
      signal(),
    )
    assertEquals(frame, null)
    assertEquals(events.at(-1), { type: 'unclear', message: 'Sorry, what do you mean?' })
    assertEquals(events.some((e) => e.type === 'text'), false)
    assertEquals(session.frames.length, 1)
    assertEquals(images.prompts.length, 1)
  }))

Deno.test('runChainFrame skips rendering when a done Action leaves the Scene unchanged', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const session = newSession()
    const deps = {
      store: chainStore(root),
      textModel: scriptedTextModel([reply('standing'), reply('standing')]),
      imageGenerator: images,
    }
    await runChainFrame(deps, session, testScenario, null, () => {}, signal())
    const frame = await runChainFrame(
      deps,
      session,
      testScenario,
      'Lean on the wall',
      () => {},
      signal(),
    )
    assertEquals(frame!.outcome, 'done')
    assertEquals(frame!.image, session.frames[0].image)
    assertEquals(images.prompts.length, 1)
  }))

Deno.test('runChainFrame treats the Opening Frame as done whatever the Text Model says', () =>
  withTempDir(async (root) => {
    const frame = await runChainFrame(
      {
        store: chainStore(root),
        textModel: scriptedTextModel([reply('standing', { outcome: 'unclear' })]),
        imageGenerator: fakeImageGenerator(),
      },
      newSession(),
      testScenario,
      null,
      () => {},
      signal(),
    )
    assertEquals(frame!.outcome, 'done')
    assertMatch(frame!.image, /^frame-0-[0-9a-f]{8}\.png$/)
  }))

async function sessionWithFrames(root: string, replies: ReturnType<typeof reply>[]) {
  const store = chainStore(root)
  const session = newSession()
  const deps = {
    store,
    // A copy: the scripted model consumes its list as it replies.
    textModel: scriptedTextModel([...replies]),
    imageGenerator: fakeImageGenerator(),
  }
  await runChainFrame(deps, session, testScenario, null, () => {}, signal())
  for (let i = 1; i < replies.length; i++) {
    await runChainFrame(deps, session, testScenario, `Action ${i}`, () => {}, signal())
  }
  return { store, session, deps }
}

const imageExists = (root: string, file: string) =>
  Deno.stat(join(root, 's1', file)).then(() => true, () => false)

Deno.test('undoLatestFrame restores the previous Scene and deletes the image', () =>
  withTempDir(async (root) => {
    const { store, session } = await sessionWithFrames(root, [reply('standing'), reply('sitting')])
    const undone = session.frames[1]
    const updated = await undoLatestFrame(store, session, 1)
    assertEquals(updated.frames.map((t) => t.prompt), [promptWith('standing')])
    assertEquals((await store.load('s1'))?.frames.length, 1)
    assertEquals(await imageExists(root, undone.image), false)
    assertEquals(await imageExists(root, session.frames[0].image), true)
  }))

Deno.test("undoLatestFrame deletes the undone Frame's upscale too", () =>
  withTempDir(async (root) => {
    const { store, session, deps } = await sessionWithFrames(root, [
      reply('standing'),
      reply('sitting'),
    ])
    const upscaled = await upscaleFrame(
      deps,
      session,
      1,
      'seedvr2-7b',
      () => {},
      signal(),
    ) as typeof session
    const latest = upscaled.frames[1]
    assertEquals(await imageExists(root, latest.upscaled!), true)
    await undoLatestFrame(store, upscaled, 1)
    assertEquals(await imageExists(root, latest.upscaled!), false)
  }))

Deno.test('undoLatestFrame keeps an image a remaining Frame still shows', () =>
  withTempDir(async (root) => {
    const { store, session } = await sessionWithFrames(root, [
      reply('standing'),
      reply('standing'),
    ])
    // A done Action that changed nothing reuses the picture before it.
    assertEquals(session.frames[1].image, session.frames[0].image)
    await undoLatestFrame(store, session, 1)
    assertEquals(await imageExists(root, session.frames[0].image), true)
  }))

Deno.test('undoLatestFrame refuses anything but the latest Frame, and the Opening Frame', () =>
  withTempDir(async (root) => {
    const { store, session } = await sessionWithFrames(root, [reply('standing'), reply('sitting')])
    await assertRejects(() => undoLatestFrame(store, session, 0), UndoError, 'not the latest')
    const updated = await undoLatestFrame(store, session, 1)
    await assertRejects(() => undoLatestFrame(store, updated, 1), UndoError, 'not the latest')
    await assertRejects(() => undoLatestFrame(store, updated, 0), UndoError, "can't be undone")
  }))

Deno.test('a Frame after an Undo gets a fresh image name', () =>
  withTempDir(async (root) => {
    const { store, session, deps } = await sessionWithFrames(root, [
      reply('standing'),
      reply('sitting'),
    ])
    const undoneImage = session.frames[1].image
    const updated = await undoLatestFrame(store, session, 1)
    deps.textModel = scriptedTextModel([reply('kneeling')])
    const redo = await runChainFrame(deps, updated, testScenario, 'Kneel', () => {}, signal())
    assertEquals(redo!.index, 1)
    assertNotEquals(redo!.image, undoneImage)
  }))

Deno.test('runChainFrame removes an image written just before the Frame was cancelled', () =>
  withTempDir(async (root) => {
    const store = chainStore(root)
    const session = newSession()
    await store.save(session)
    const controller = new AbortController()
    await assertRejects(() =>
      runChainFrame(
        {
          store,
          textModel: scriptedTextModel([reply('standing')]),
          // Finishes writing, then the Frame is cancelled before the generator returns.
          imageGenerator: {
            ...fakeImageGenerator(),
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
  const deps = { store: chainStore(root), textModel, imageGenerator: images }
  await runChainFrame(deps, session, testScenario, null, () => {}, signal())
  return { session, textModel, images, deps }
}

Deno.test('runChainFrame declines an Action that crosses a limit without asking the Text Model', () =>
  withTempDir(async (root) => {
    const { session, textModel, images, deps } = await openedSession(root, [])
    const events: FrameEvent[] = []
    const frame = await runChainFrame(
      deps,
      session,
      testScenario,
      'make her topless',
      (e) => events.push(e),
      signal(),
    )
    assertEquals(frame, null)
    assertEquals(events.at(-1), {
      type: 'declined',
      message: 'Declined: no sexual or nude imagery.',
    })
    assertEquals(session.frames.length, 1)
    assertEquals(textModel.calls, 1) // the Opening Frame only
    assertEquals(images.prompts.length, 1)
  }))

Deno.test('runChainFrame declines a prompt the Text Model wrote across a limit', () =>
  withTempDir(async (root) => {
    const { session, deps } = await openedSession(root, [
      reply('kneeling', { prompt: `${promptWith('kneeling')} She is a 15 year old girl.` }),
    ])
    const events: FrameEvent[] = []
    const frame = await runChainFrame(
      deps,
      session,
      testScenario,
      'make her younger',
      (e) => events.push(e),
      signal(),
    )
    assertEquals(frame, null)
    assertEquals(events.at(-1), {
      type: 'declined',
      message: 'Declined: everyone depicted must be an adult.',
    })
    assertEquals(session.frames.length, 1)
  }))

Deno.test('runChainFrame fails an Opening Frame whose prompt crosses a limit', () =>
  withTempDir(async (root) => {
    await assertRejects(
      () =>
        runChainFrame(
          {
            store: chainStore(root),
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

Deno.test('runChainFrame asks about real people only when an Action might name one', () =>
  withTempDir(async (root) => {
    const { session, textModel, deps } = await openedSession(
      root,
      [reply('crouching')],
      ['Serena Williams'],
    )
    const events: FrameEvent[] = []
    const declined = await runChainFrame(
      deps,
      session,
      testScenario,
      'make her look like Serena Williams',
      (e) => events.push(e),
      signal(),
    )
    assertEquals(declined, null)
    assertEquals(events.at(-1), {
      type: 'declined',
      message: 'Declined: no real, identifiable people.',
    })
    const done = await runChainFrame(deps, session, testScenario, 'crouch low', () => {}, signal())
    assertEquals(done!.outcome, 'done')
    assertEquals(textModel.personChecks, ['make her look like Serena Williams'])
  }))

Deno.test("runChainFrame streams the Text Model's thinking and saves it with the Frame", () =>
  withTempDir(async (root) => {
    const events: FrameEvent[] = []
    const frame = await runChainFrame(
      {
        store: chainStore(root),
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
    assertEquals(frame!.thinking, 'She should stand. Done.')
  }))

Deno.test('runChainFrame marks thinking from a retry as a restart, and saves no thinking when off', () =>
  withTempDir(async (root) => {
    const events: FrameEvent[] = []
    const session = newSession()
    const deps = {
      store: chainStore(root),
      textModel: scriptedTextModel([
        new Error('bad JSON'),
        reply('standing', { thinking: 'Second try.' }),
        reply('sitting'),
      ]),
      imageGenerator: fakeImageGenerator(),
    }
    // The failed first attempt streamed nothing here, but the retry's first chunk says restart.
    await runChainFrame(deps, session, testScenario, null, (e) => events.push(e), signal())
    const first = events.find((e) => e.type === 'thinking')
    assertEquals(first, { type: 'thinking', text: 'Second ', restart: true })
    const plain = await runChainFrame(deps, session, testScenario, 'Sit', () => {}, signal())
    assertEquals('thinking' in plain!, false)
  }))

Deno.test('runChainFrame records how long the text and image steps took', () =>
  withTempDir(async (root) => {
    const session = newSession()
    const images = fakeImageGenerator()
    const deps = {
      store: chainStore(root),
      textModel: scriptedTextModel([reply('standing'), reply('standing')]),
      imageGenerator: {
        ...images,
        async generate(...args: Parameters<typeof images.generate>) {
          await new Promise((r) => setTimeout(r, 120))
          return images.generate(...args)
        },
      },
    }
    const opening = await runChainFrame(deps, session, testScenario, null, () => {}, signal())
    assertEquals(typeof opening!.timings!.text, 'number')
    assertEquals(opening!.timings!.image! >= 0.1, true)
    assertEquals('queued' in opening!.timings!, false)

    // Nothing changed, so the image is reused: no image time.
    const reused = await runChainFrame(deps, session, testScenario, 'Stay', () => {}, signal())
    assertEquals(reused!.timings!.image, null)
  }))

Deno.test('runChainFrame records time spent waiting for another render', () =>
  withTempDir(async (root) => {
    const queue = new RenderQueue()
    const release = await queue.acquire(new AbortController().signal)
    setTimeout(release, 150)
    const frame = await runChainFrame(
      {
        store: chainStore(root),
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
    assertEquals(frame!.timings!.queued! >= 0.1, true)
  }))

Deno.test('A render that first downloads its model shows that, then rendering again with its steps', () => {
  const events: ProgressEvent[] = []
  const { onProgress, onDownload } = imageProgress((e) => events.push(e))
  onDownload()
  onDownload()
  onProgress(1, 4)
  onProgress(2, 4)
  assertEquals(events, [
    { type: 'phase', phase: 'download' },
    { type: 'phase', phase: 'image' },
    { type: 'progress', step: 1, total: 4 },
    { type: 'progress', step: 2, total: 4 },
  ])
})
