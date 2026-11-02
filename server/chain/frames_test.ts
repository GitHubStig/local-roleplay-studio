import { ContextFullError } from '../text/chat.ts'
import { assertEquals, assertNotEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import type { Backend } from '../backends.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import { type ChainSession, dirSessionStore, type SessionStore } from '../session.ts'
import {
  fakeImageGenerator,
  promptWith,
  reply,
  scriptedTextModel,
  testScenario,
  withTempDir,
} from '../testing.ts'
import { imageProgress, type ProgressEvent, upscaleFrame } from '../frames.ts'
import {
  type FrameEvent,
  renderChainFrame,
  runChainFrame,
  UNCHANGED,
  UndoError,
  undoLatestFrame,
} from './frames.ts'
import { RenderQueue } from '../renderQueue.ts'
import { updateSession } from '../update.ts'

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

/**
 * Renders a Chain Frame as its render job does, and keeps `session` up to date with it; returns
 * the Frame as rendered.
 */
async function rendered(
  deps: Parameters<typeof renderChainFrame>[0],
  session: ChainSession,
  index: number,
  emit: (event: ProgressEvent) => void = () => {},
) {
  const updated = await renderChainFrame(deps, session, index, emit, signal())
  session.frames = updated.frames
  return updated.frames[index]
}

Deno.test('runChainFrame commits the Opening Frame with its image prompt, its picture to come', () =>
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
    assertEquals([frame!.index, frame!.prompt, frame!.pictures], [0, promptWith('standing'), []])
    // Its render is a job of its own (ADR 0030).
    assertEquals(images.prompts, [])
    assertEquals(events.map((e) => e.type), ['phase', 'committed'])
    assertEquals((await store.load('s1'))?.frames.length, 1)
  }))

Deno.test('runChainFrame sends everyone away, for someone brought back', () =>
  withTempDir(async (root) => {
    const store = chainStore(root)
    const said = (subject: string) => reply('standing', { prompt: `${subject} ${promptWith('x')}` })
    const textModel = scriptedTextModel([
      said('Kael is lean; the traveller is slender.'),
      said('Kael is lean.'),
      said('Kael is lean; the traveller is slender.'),
    ])
    const deps = { store, textModel, imageGenerator: fakeImageGenerator() }
    let session: ChainSession = newSession()
    for (const action of [null, 'She leaves', 'She comes back']) {
      await runChainFrame(deps, session, testScenario, action, () => {}, signal())
      session = (await store.load('s1')) as ChainSession
    }
    assertEquals(textModel.requests.map((r) => r.away), [
      [],
      [],
      ['the traveller is slender'],
    ])
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

Deno.test("runChainFrame doesn't retry a conversation that outgrew the context", () =>
  withTempDir(async (root) => {
    const store = chainStore(root)
    const session = newSession()
    await store.save(session)
    await assertRejects(
      () =>
        runChainFrame(
          {
            store,
            // A retry would succeed here; it mustn't be made.
            textModel: scriptedTextModel([new ContextFullError(8192), reply('standing')]),
            imageGenerator: fakeImageGenerator(),
          },
          session,
          testScenario,
          null,
          () => {},
          signal(),
        ),
      ContextFullError,
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
    assertEquals(session.frames.length, 1)
    assertEquals((await store.load('s1'))?.frames.length, 1)
    assertEquals(images.prompts.length, 0)
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
    assertEquals(session.frames.length, 1)
    assertEquals(images.prompts.length, 0)
  }))

Deno.test('runChainFrame saves no Frame when a done Action leaves the Image Prompt unchanged', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const session = newSession()
    const store = chainStore(root)
    const deps = {
      store,
      textModel: scriptedTextModel([
        reply('standing'),
        reply('standing', { narration: 'Leaning.' }),
      ]),
      imageGenerator: images,
    }
    await runChainFrame(deps, session, testScenario, null, () => {}, signal())
    const events: FrameEvent[] = []
    const frame = await runChainFrame(
      deps,
      session,
      testScenario,
      'Lean on the wall',
      (e) => events.push(e),
      signal(),
    )
    assertEquals(frame, null)
    assertEquals(events.at(-1), { type: 'unchanged', message: UNCHANGED })
    assertEquals((await store.load(session.id))!.frames.length, 1)
    assertEquals(images.prompts.length, 0)
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
  await rendered(deps, session, 0)
  for (let i = 1; i < replies.length; i++) {
    await runChainFrame(deps, session, testScenario, `Action ${i}`, () => {}, signal())
    await rendered(deps, session, i)
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
    assertEquals(await imageExists(root, undone.pictures[0].image), false)
    assertEquals(await imageExists(root, session.frames[0].pictures[0].image), true)
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
      (change) => updateSession(store, session.id, 'chain', (s) => change(s) as typeof s),
    ) as typeof session
    const latest = upscaled.frames[1]
    assertEquals(await imageExists(root, latest.pictures[0].upscaled!), true)
    await undoLatestFrame(store, upscaled, 1)
    assertEquals(await imageExists(root, latest.pictures[0].upscaled!), false)
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
    const undoneImage = session.frames[1].pictures[0].image
    const updated = await undoLatestFrame(store, session, 1)
    deps.textModel = scriptedTextModel([reply('kneeling')])
    const redo = await runChainFrame(deps, updated, testScenario, 'Kneel', () => {}, signal())
    assertEquals(redo!.index, 1)
    assertNotEquals((await rendered(deps, updated, 1)).pictures[0].image, undoneImage)
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
    assertEquals(images.prompts.length, 0)
  }))

Deno.test('runChainFrame declines a prompt the Text Model wrote across a sexual Limit', () =>
  withTempDir(async (root) => {
    const { session, deps } = await openedSession(root, [
      reply('kneeling', { prompt: `${promptWith('kneeling')} She is nude.` }),
    ])
    const events: FrameEvent[] = []
    const frame = await runChainFrame(
      deps,
      session,
      testScenario,
      'change the lighting',
      (e) => events.push(e),
      signal(),
    )
    assertEquals(frame, null)
    assertEquals(events.at(-1), {
      type: 'declined',
      message: 'Declined: no sexual or nude imagery.',
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

Deno.test('A Chain Frame records how long its text and its render took', () =>
  withTempDir(async (root) => {
    const session = newSession()
    const images = fakeImageGenerator()
    const deps = {
      store: chainStore(root),
      textModel: scriptedTextModel([reply('standing')]),
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
    const { timings } = (await rendered(deps, session, 0)).pictures[0]
    assertEquals(timings!.image >= 0.1, true)
    assertEquals('queued' in timings!, false)
  }))

Deno.test('A Chain Frame’s render records time spent waiting for another', () =>
  withTempDir(async (root) => {
    const queue = new RenderQueue()
    const deps = {
      store: chainStore(root),
      textModel: scriptedTextModel([reply('standing')]),
      imageGenerator: fakeImageGenerator(),
      renderQueue: queue,
    }
    const session = newSession()
    await runChainFrame(deps, session, testScenario, null, () => {}, signal())
    const release = await queue.acquire(new AbortController().signal)
    setTimeout(release, 150)
    assertEquals((await rendered(deps, session, 0)).pictures[0].timings!.queued! >= 0.1, true)
  }))

Deno.test('A render says which kind of backend it runs on as it starts, and its picture keeps it', () =>
  withTempDir(async (root) => {
    const events: ProgressEvent[] = []
    const pc: Backend = { id: 'pc', kind: 'comfyui', address: 'http://192.0.2.85:8188' }
    const deps = {
      store: chainStore(root),
      textModel: scriptedTextModel([reply('standing')]),
      imageGenerator: fakeImageGenerator(),
      backendOf: () => Promise.resolve<Backend | undefined>(pc),
    }
    const session = newSession()
    await runChainFrame(deps, session, testScenario, null, () => {}, signal())
    const frame = await rendered(deps, session, 0, (e) => events.push(e))
    // The page shows ComfyUI's previews as the picture forms, and none for mflux, which sends none.
    assertEquals(
      events.find((e) => e.type === 'phase' && e.phase === 'image'),
      { type: 'phase', phase: 'image', imageBackend: 'comfyui' },
    )
    assertEquals(frame.pictures[0].imageBackend, 'comfyui')
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
