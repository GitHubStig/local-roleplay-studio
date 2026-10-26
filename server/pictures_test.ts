import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { renderChainFrame, runChainFrame, undoLatestFrame } from './chain/frames.ts'
import { findImageModel } from './images/imageModels.ts'
import { type Backend, HERE } from './backends.ts'
import {
  changedSinceRender,
  changePicture,
  ImageModelError,
  pickedVersion,
  type Picture,
  pictureFiles,
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
    // Renders go to this machine's mflux, unless a test sends them elsewhere.
    backendOf: () => Promise.resolve<Backend | undefined>(HERE),
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
      'There\'s no Image Model "no-such-model"',
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
    // Rendered again by the Chain's model, it replaces only that model's picture.
    const again = await renderChainFrame(deps, rendered, 1, () => {}, signal())
    const [stillKept, remade] = again.frames[1].pictures
    assertEquals([stillKept, remade.imageModel], [old, KLEIN])
    assertEquals(await exists(made.image), false)

    const back = await switchImageModel(store, again, QWEN)
    assertEquals(shownPicture(back.frames[1], QWEN), old)

    // Undo deletes every model's picture.
    await undoLatestFrame(store, back as ChainSession, 1)
    assertEquals([await exists(old.image), await exists(remade.image)], [false, false])
  }))

Deno.test("The same model's pictures stay wherever it renders, each saying the backend that made it", () =>
  withTempDir(async (root) => {
    const { store, deps } = await chainOfTwo(root)
    const loaded = (await store.load('s1')) as ChainSession
    assertEquals(loaded.frames[1].pictures[0].imageBackend, 'mflux')

    await assertRejects(
      () => switchImageModel(store, loaded, 'dall-e'),
      ImageModelError,
      'There\'s no Image Model "dall-e"',
    )
    // Steps start at the model's default where it would render: Z-Image Turbo takes 9 on mflux,
    // 8 on ComfyUI.
    const z = await switchImageModel(store, loaded, 'z-image-turbo', 'comfyui')
    assertEquals([z.settings.imageModel, z.settings.steps], ['z-image-turbo', 8])
    const qwen = await switchImageModel(store, z, QWEN) as ChainSession
    assertEquals(shownPicture(qwen.frames[1], QWEN), loaded.frames[1].pictures[0])

    // Settings send renders to a ComfyUI now: rendered there, it takes the mflux picture's place,
    // as the same model.
    const pc: Backend = { id: 'pc', kind: 'comfyui', address: 'http://192.168.50.85:8188' }
    const onPc = { ...deps, backendOf: () => Promise.resolve<Backend | undefined>(pc) }
    const rendered = await renderChainFrame(onPc, qwen, 1, () => {}, signal())
    assertEquals(rendered.frames[1].pictures.map((p) => [p.imageModel, p.imageBackend]), [
      [QWEN, 'comfyui'],
    ])
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

Deno.test("A render runs as Settings are now, keeping the Session's model, steps and seed", () =>
  withTempDir(async (root) => {
    const { store, deps, images } = await chainOfTwo(root)
    const qwen = (await store.load('s1')) as ChainSession
    const klein = await switchImageModel(store, qwen, KLEIN) as ChainSession
    const now = { ...DEFAULT_SETTINGS, imageModel: KREA, steps: 8, size: 'landscape' }
    await renderChainFrame(
      { ...deps, settings: () => Promise.resolve(now) },
      klein,
      1,
      () => {},
      signal(),
    )
    const used = images.settings.at(-1)!
    assertEquals([used.imageModel, used.steps, used.size], [KLEIN, 4, 'landscape'])
  }))

Deno.test("A picture is its picked version, and is made of every version's files", () => {
  const edit = (n: number) => ({
    image: `edit-${n}.png`,
    instructions: ['Paint'],
    editModel: 'qwen-image-2.1-edit',
    seed: 1,
    mask: `mask-${n}.png`,
  })
  const picture = {
    image: 'r.png',
    imageModel: QWEN,
    upscaled: 'r-2048.png',
    edits: [edit(1), { ...edit(2), upscaled: 'e2-2048.png' }],
  }
  assertEquals(pickedVersion(picture).image, 'r.png')
  assertEquals(pickedVersion({ ...picture, picked: 2 }).upscaled, 'e2-2048.png')
  assertEquals(pictureFiles(picture), [
    'r.png',
    'r-2048.png',
    'edit-1.png',
    'mask-1.png',
    'edit-2.png',
    'e2-2048.png',
    'mask-2.png',
  ])
  // What's made from a version goes onto that version, found by its image.
  const [changed] = changePicture(
    [picture],
    'edit-1.png',
    (v) => ({ ...v, upscaled: 'e1-2048.png' }),
  )
  assertEquals([changed.upscaled, changed.edits![0].upscaled], ['r-2048.png', 'e1-2048.png'])
})
