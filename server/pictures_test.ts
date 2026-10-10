import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { renderChainFrame, runChainFrame, undoLatestFrame } from './chain/frames.ts'
import { findImageModel } from './images/imageModels.ts'
import {
  changedSinceRender,
  ImageModelError,
  type Picture,
  shownPicture,
  switchImageModel,
  withPicture,
} from './pictures.ts'
import { DEFAULT_SETTINGS } from './settings.ts'
import { type ChainSession, dirSessionStore } from './session.ts'
import {
  fakeImageGenerator,
  reply,
  scriptedTextModel,
  testScenario,
  withTempDir,
} from './testing.ts'

const QWEN = 'qwen-image-2.1'
const KLEIN = 'flux2-klein-4b'
const KREA = 'krea-2'
const signal = () => new AbortController().signal

const picture = (image: string, imageModel: string, extra: Partial<Picture> = {}): Picture => ({
  image,
  imageModel,
  ...extra,
})

Deno.test("A Frame shows its picture by the Session's model, or else its latest", () => {
  const frame = { index: 0, pictures: [picture('q.png', QWEN), picture('k.png', KLEIN)] }
  assertEquals(shownPicture(frame, QWEN)?.image, 'q.png')
  assertEquals(shownPicture(frame, KLEIN)?.image, 'k.png')
  assertEquals(shownPicture(frame, KREA)?.image, 'k.png')
  assertEquals(shownPicture({ index: 0, pictures: [] }, QWEN), undefined)
})

Deno.test('A picture is changed since render when stale, or by another model', () => {
  assertEquals(changedSinceRender(picture('q.png', QWEN), QWEN), false)
  assertEquals(changedSinceRender(picture('q.png', QWEN, { stale: true }), QWEN), true)
  assertEquals(changedSinceRender(picture('q.png', QWEN), KLEIN), true)
})

Deno.test("A new picture replaces the same model's, as the latest", () => {
  const old = [picture('q.png', QWEN, { upscaled: 'q-2048.png' }), picture('k.png', KLEIN)]
  assertEquals(withPicture(old, picture('q2.png', QWEN)), {
    pictures: [picture('k.png', KLEIN), picture('q2.png', QWEN)],
    replaced: old[0],
  })
  assertEquals(withPicture(old, picture('r.png', KREA)), {
    pictures: [...old, picture('r.png', KREA)],
    replaced: undefined,
  })
})

/** A Chain of two Frames rendered by Qwen-Image, saved in `root`. */
async function chainOfTwo(root: string) {
  const store = dirSessionStore(root)
  const session: ChainSession = {
    id: 's1',
    kind: 'chain',
    brief: null,
    scenarioId: 'test',
    settings: { ...DEFAULT_SETTINGS, textModel: 'fake', imageModel: QWEN },
    seed: 7,
    createdAt: '2026-10-10T00:00:00.000Z',
    frames: [],
  }
  await store.save(session)
  const images = fakeImageGenerator()
  const deps = {
    store,
    textModel: scriptedTextModel([reply('standing'), reply('sitting')]),
    imageGenerator: images,
  }
  await runChainFrame(deps, session, testScenario, null, () => {}, signal())
  await runChainFrame(deps, session, testScenario, 'Sit', () => {}, signal())
  const exists = (file: string) => Deno.stat(join(root, 's1', file)).then(() => true, () => false)
  return { store, deps, images, exists }
}

Deno.test('Switching model changes only the model and its steps', () =>
  withTempDir(async (root) => {
    const { store } = await chainOfTwo(root)
    const before = (await store.load('s1'))!
    assertEquals(before.frames.map((f) => f.pictures.map((p) => p.imageModel)), [[QWEN], [QWEN]])
    const switched = await switchImageModel(store, before, KLEIN)
    assertEquals(switched.settings, {
      ...before.settings,
      imageModel: KLEIN,
      steps: findImageModel('mflux', KLEIN)!.defaultSteps,
    })
    assertEquals(switched.frames, before.frames)
    await assertRejects(
      () => switchImageModel(store, switched, 'no-such-model'),
      ImageModelError,
      'mflux has no Image Model "no-such-model"',
    )
  }))

Deno.test("A render on the new model keeps the old one's picture, shown again on switching back", () =>
  withTempDir(async (root) => {
    const { store, deps, images, exists } = await chainOfTwo(root)
    const qwen = (await store.load('s1')) as ChainSession
    const [old] = qwen.frames[1].pictures
    const klein = await switchImageModel(store, qwen, KLEIN) as ChainSession

    const rendered = await renderChainFrame(deps, klein, 1, () => {}, signal())
    const [kept, made] = rendered.frames[1].pictures
    assertEquals([kept, made.imageModel], [old, KLEIN])
    assertEquals(shownPicture(rendered.frames[1], KLEIN), made)
    assertEquals(images.prompts.length, 3)
    assertEquals(await exists(old.image), true)
    // Rendered by the Chain's model now: nothing to render again.
    await assertRejects(() => renderChainFrame(deps, rendered, 1, () => {}, signal()))

    const back = await switchImageModel(store, rendered, QWEN)
    assertEquals(shownPicture(back.frames[1], QWEN), old)

    // Undo deletes every model's picture.
    await undoLatestFrame(store, back as ChainSession, 1)
    assertEquals([await exists(old.image), await exists(made.image)], [false, false])
  }))

Deno.test('A render that finishes after the Session switched model keeps its own model', () =>
  withTempDir(async (root) => {
    const { store, deps } = await chainOfTwo(root)
    const qwen = (await store.load('s1')) as ChainSession
    const klein = await switchImageModel(store, qwen, KLEIN) as ChainSession
    // Started while the Chain was on Klein; it switches back to Qwen while it renders.
    const generate = deps.imageGenerator.generate
    deps.imageGenerator.generate = async (...args) => {
      await switchImageModel(store, klein, QWEN)
      return generate(...args)
    }
    const rendered = await renderChainFrame(deps, klein, 1, () => {}, signal())
    const frame = rendered.frames[1]
    assertEquals(frame.pictures.map((p) => p.imageModel), [QWEN, KLEIN])
    assertEquals(shownPicture(frame, rendered.settings.imageModel), qwen.frames[1].pictures[0])
  }))
