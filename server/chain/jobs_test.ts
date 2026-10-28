import { assertEquals, assertMatch, assertNotEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import type { Job } from '../jobs.ts'
import type { ImageGenerator } from '../images/imageGenerator.ts'
import type { Picture } from '../pictures.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import { fakeFigureMaker, fakeSceneMaker } from '../3d/testing.ts'
import {
  fakeImageGenerator,
  promptWith,
  reply,
  scriptedTextModel,
  withTempDir,
} from '../testing.ts'
import {
  chainFrames,
  chainOfTwo,
  type JsonFrame,
  readEvents,
  settled,
  setup,
  shown,
} from '../appTesting.ts'

Deno.test('A Chain Frame other than the Opening is deleted, and those after it numbered down', () =>
  withTempDir(async (root) => {
    const { call } = await chainOfTwo(root, {
      textModel: scriptedTextModel([
        reply('standing'),
        reply('sitting'),
        reply('kneeling'),
        reply('rising'),
      ]),
    })
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Kneel' }))
    const before = (await (await call('GET', '/api/sessions/s1')).json()).frames as JsonFrame[]
    const remove = (index: number, frames = before.length) =>
      call('POST', `/api/sessions/s1/frames/${index}/delete`, {
        frames,
        createdAt: before[index]?.createdAt,
      })

    const deleted = await remove(1)
    assertEquals(deleted.status, 200)
    const after = (await deleted.json()).frames as JsonFrame[]
    assertEquals(after.map((f) => [f.index, f.action]), [[0, null], [1, 'Kneel']])
    // The Frame after it keeps its Image Prompt and pictures, as written from the deleted one's.
    assertEquals(after[1].prompt, before[2].prompt)
    assertEquals(shown(after[1]).image, shown(before[2]).image)
    assertEquals(
      (await call('GET', `/api/sessions/s1/images/${shown(before[1]).image}`)).status,
      404,
    )
    assertEquals(
      (await call('GET', `/api/sessions/s1/images/${shown(after[1]).image}`)).status,
      200,
    )

    // Asked again, it names a Frame no longer there, not the one that took its place (made the same
    // millisecond here, so its count tells them apart).
    const again = await remove(1)
    assertEquals([again.status, (await again.json()).error], [409, 'That Frame is no longer there'])
    const opening = await remove(0, after.length)
    assertEquals([opening.status, (await opening.json()).error], [
      409,
      "The Opening Frame can't be deleted",
    ])
    assertEquals((await call('POST', '/api/sessions/s1/frames/1/delete', {})).status, 400)
    // The next Frame is made from the latest, as ever.
    const next = await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Rise' }))
    assertEquals((next.at(-1)![1].frame as JsonFrame).index, 2)
  }))

Deno.test('Deleting a Chain Frame waits for no job on it, and the queue follows', () =>
  withTempDir(async (root) => {
    // Pictures made with the Frames go through; the upscales queued later hang until cancelled.
    const quick = fakeImageGenerator()
    const slow = fakeImageGenerator({ hang: true })
    let hang = false
    const images = {
      ...quick,
      generate: (...a: Parameters<typeof quick.generate>) => (hang ? slow : quick).generate(...a),
      upscale: (...a: Parameters<typeof quick.upscale>) => (hang ? slow : quick).upscale(...a),
    }
    const four = [reply('standing'), reply('sitting'), reply('kneeling'), reply('rising')]
    const { call } = await chainOfTwo(root, {
      imageGenerator: images,
      textModel: scriptedTextModel(four),
    })
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Kneel' }))
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Rise' }))
    const frames = (await (await call('GET', '/api/sessions/s1')).json()).frames as JsonFrame[]
    const remove = (index: number) =>
      call('POST', `/api/sessions/s1/frames/${index}/delete`, {
        frames: frames.length,
        createdAt: frames[index].createdAt,
      })
    const listed = async () => (await (await call('GET', '/api/sessions/s1/jobs')).json()) as Job[]
    const jobs = async () => (await listed()).map((j) => [j.frameIndex, j.status])
    const upscale = (frameIndex: number) =>
      call('POST', '/api/sessions/s1/jobs', { kind: 'upscale', frameIndex })
    const cancelAll = async () => {
      hang = false
      for (const job of await listed()) await call('DELETE', `/api/sessions/s1/jobs/${job.id}`)
      await settled(call)
      hang = true
    }

    hang = true
    for (const index of [2, 3, 1]) await upscale(index)
    assertEquals(await jobs(), [[2, 'running'], [3, 'queued'], [1, 'queued']])
    const refused = await remove(2)
    assertEquals([refused.status, (await refused.json()).error], [
      409,
      'Frame 2 has a job running: wait for it, or cancel it, then delete',
    ])
    assertEquals(await jobs(), [[2, 'running'], [3, 'queued'], [1, 'queued']])

    // Frame 1 goes, its upscale with it; the jobs on later Frames follow them down, running or not.
    assertEquals((await remove(1)).status, 200)
    assertEquals(await jobs(), [[1, 'running'], [2, 'queued']])
    await cancelAll()
    hang = false
  }))

Deno.test('A render running on a later Chain Frame lands on it after an earlier one is deleted', () =>
  withTempDir(async (root) => {
    const quick = fakeImageGenerator()
    // Renders wait while it's held: the third Frame's, until the earlier Frame is deleted.
    const gate: { held?: PromiseWithResolvers<void> } = {}
    const images = {
      ...quick,
      generate: async (...a: Parameters<typeof quick.generate>) => {
        await gate.held?.promise
        return quick.generate(...a)
      },
    }
    const four = [reply('standing'), reply('sitting'), reply('kneeling'), reply('rising')]
    const { call } = await chainOfTwo(root, {
      imageGenerator: images,
      textModel: scriptedTextModel(four),
    })
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Kneel' }))
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Rise' }))
    const before = await chainFrames(call)

    gate.held = Promise.withResolvers()
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 3 })
    const deleted = await call('POST', '/api/sessions/s1/frames/1/delete', {
      frames: before.length,
      createdAt: before[1].createdAt,
    })
    assertEquals(deleted.status, 200)
    gate.held.resolve()
    await settled(call)

    const after = await chainFrames(call)
    assertEquals(after.map((f) => f.prompt), [0, 2, 3].map((i) => before[i].prompt))
    // The new picture is on the Frame it was rendered for, now Frame 2, and nowhere else.
    assertEquals(after[2].pictures.length, 1)
    assertNotEquals(after[2].pictures[0].image, before[3].pictures[0].image)
    assertEquals([after[0], after[1]].map((f) => f.pictures), [0, 2].map((i) => before[i].pictures))
  }))

Deno.test('A Chain Frame’s Image Prompt is edited by hand, its pictures out of date until rendered', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = await chainOfTwo(root, { imageGenerator: images })
    const before = await chainFrames(call)
    const render = () => call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 0 })

    const edited = await call('PUT', '/api/sessions/s1/frames/0', {
      prompt: '  A person,\n standing, in a garden.  ',
    })
    assertEquals(edited.status, 200)
    const frames = (await edited.json()).frames as JsonFrame[]
    assertEquals(frames[0].prompt, 'A person, standing, in a garden.')
    assertEquals(shown(frames[0]).stale, true)
    // The Frames after it keep their own prompts and pictures.
    assertEquals([frames[1].prompt, shown(frames[1]).stale], [promptWith('sitting'), undefined])

    // Rendered again from the new prompt, it's up to date.
    assertEquals((await render()).status, 201)
    await settled(call)
    const [opening] = await chainFrames(call)
    assertEquals([opening.stale, images.prompts.at(-1)], [
      undefined,
      'A person, standing, in a garden.',
    ])
    assertEquals(opening.image === before[0].image, false)

    const put = (index: number, body: unknown) =>
      call('PUT', `/api/sessions/s1/frames/${index}`, body)
    assertEquals((await put(0, { prompt: 'A nude figure.' })).status, 422)
    assertEquals((await put(0, { prompt: '  ' })).status, 400)
    assertEquals((await put(0, {})).status, 400)
    assertEquals((await put(9, { prompt: 'A garden.' })).status, 404)
  }))

Deno.test('A Chain Frame with an up-to-date picture renders again, replacing it', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = await chainOfTwo(root, { imageGenerator: images })
    const [, before] = await chainFrames(call)
    const rendered = images.prompts.length
    const job = await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 1 })
    assertEquals(job.status, 201)
    assertEquals(await settled(call), [])
    const [, after] = await chainFrames(call)
    // One picture by the Chain's Image Model, the new one; the old file is gone.
    assertEquals([images.prompts.length, after.pictures.length], [rendered + 1, 1])
    assertEquals(after.image === before.image, false)
    const image = (name: string) => call('GET', `/api/sessions/s1/images/${name}`)
    assertEquals([(await image(before.image)).status, (await image(after.image)).status], [
      404,
      200,
    ])
  }))

Deno.test('A Chain queues an upscale of one Frame, once', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = await chainOfTwo(root, { imageGenerator: images })
    const queued = await call('POST', '/api/sessions/s1/jobs', { kind: 'upscale', frameIndex: 1 })
    assertEquals(queued.status, 201)
    assertEquals(await settled(call), [])
    const [opening, second] = await chainFrames(call)
    assertMatch(second.upscaled!, /^frame-1-[0-9a-f]{8}-2048\.png$/)
    assertEquals(opening.upscaled, undefined)
    assertEquals(images.upscaled, [second.image])
    assertEquals((await call('GET', `/api/sessions/s1/images/${second.upscaled}`)).status, 200)
    const again = await call('POST', '/api/sessions/s1/jobs', { kind: 'upscale', frameIndex: 1 })
    assertEquals(again.status, 409)

    // Deleting the upscale keeps the picture, and it can be upscaled again.
    const upscale = (path = '/api/sessions/s1/pictures/1/upscale') => call('DELETE', path)
    assertEquals((await upscale()).status, 200)
    const [, after] = await chainFrames(call)
    assertEquals([after.upscaled, after.image], [undefined, second.image])
    assertEquals((await call('GET', `/api/sessions/s1/images/${second.upscaled}`)).status, 404)
    assertEquals((await call('GET', `/api/sessions/s1/images/${second.image}`)).status, 200)
    assertEquals((await upscale()).status, 409)
    const redo = await call('POST', '/api/sessions/s1/jobs', { kind: 'upscale', frameIndex: 1 })
    assertEquals(redo.status, 201)
    assertEquals(await settled(call), [])
    assertMatch((await chainFrames(call))[1].upscaled!, /-2048\.png$/)
  }))

/** A PNG's bytes in base64, standing in for a painted area. */
const MASK = btoa('\x89PNG painted')

Deno.test('An edit repaints a picture as a new version, made from the newest and picked', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    // A ComfyUI listed beside mflux, for the second edit's model.
    const backends = [...DEFAULT_SETTINGS.backends, {
      id: 'pc',
      kind: 'comfyui' as const,
      address: '',
    }]
    const { call } = await chainOfTwo(root, {
      imageGenerator: images,
      settings: { textModel: 'x', backends },
    })
    const edit = (body: object) =>
      call('POST', '/api/sessions/s1/jobs', { kind: 'edit', frameIndex: 1, edit: body })
    const queued = await edit({ instruction: 'A hand with five fingers', mask: MASK })
    assertEquals(queued.status, 201)
    // The painted area is saved as it's queued, and the job names it, for the page to show.
    const { mask } = (await queued.json())[0].edit
    assertMatch(mask, /^mask-1-[0-9a-f]{8}\.png$/)
    assertEquals(await settled(call), [])
    const [, first] = await chainFrames(call)
    const [one] = first.edits
    assertMatch(one.image, /^edit-1-[0-9a-f]{8}\.png$/)
    assertEquals(one.mask, mask)
    // Made here, on mflux: Qwen-Image 2.1 Edit runs on both, and Settings send edits here.
    assertEquals([one.instructions, one.editModel, one.imageBackend, first.picked], [
      ['A hand with five fingers'],
      'qwen-image-2.1-edit',
      'mflux',
      1,
    ])
    assertEquals(
      await Deno.readFile(join(root, 's1', one.mask)),
      Uint8Array.from(atob(MASK), (c) => c.charCodeAt(0)),
    )
    assertEquals([images.edits[0].image, images.edits[0].mask], [first.image, one.mask])

    // A second, of the whole picture, uses the model selected in the Edit dialog.
    assertEquals(
      (await edit({ instruction: 'Warmer light', model: 'flux3-klein-edit' })).status,
      201,
    )
    assertEquals(await settled(call), [])
    const [, second] = await chainFrames(call)
    assertEquals([images.edits[1].image, images.edits[1].mask], [one.image, undefined])
    // FLUX.3 Klein Edit runs only on ComfyUI, so it went to the one listed.
    assertEquals([images.edits[1].model, second.edits[1].editModel, second.edits[1].imageBackend], [
      'flux3-klein-edit',
      'flux3-klein-edit',
      'comfyui',
    ])
    assertEquals([second.edits.length, second.picked], [2, 2])

    // What's made from the picture is made from the picked version.
    await call('POST', '/api/sessions/s1/jobs', { kind: 'upscale', frameIndex: 1 })
    assertEquals(await settled(call), [])
    assertEquals(images.upscaled, [second.edits[1].image])
    const [, upscaled] = await chainFrames(call)
    assertMatch(upscaled.edits[1].upscaled, /-2048\.png$/)
    assertEquals(upscaled.upscaled, undefined)
    // Edits and their upscales are served, as the render is.
    const served = (name: string) => call('GET', `/api/sessions/s1/images/${name}`)
    for (const name of [one.image, one.mask, upscaled.edits[1].image, upscaled.edits[1].upscaled]) {
      assertEquals((await served(name)).status, 200)
    }
  }))

Deno.test("An edit waits for the one before, and its painted area goes if it's cancelled", () =>
  withTempDir(async (root) => {
    // Renders as usual; an edit runs till it's cancelled.
    const images: ImageGenerator = {
      ...fakeImageGenerator(),
      edit: (_req, signal) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        ),
    }
    const { call } = await chainOfTwo(root, { imageGenerator: images })
    const edit = (body: object) =>
      call('POST', '/api/sessions/s1/jobs', { kind: 'edit', frameIndex: 1, edit: body })
    const [job] = await (await edit({ instruction: 'A hand', mask: MASK })).json()
    // Another, or a retry, would be made from what this one is making.
    assertEquals((await edit({ instruction: 'A cup' })).status, 409)
    assertEquals((await edit({ instruction: 'A cup', retry: true })).status, 409)
    const masked = join(root, 's1', job.edit.mask)
    assertEquals((await Deno.stat(masked)).isFile, true)
    await call('DELETE', `/api/sessions/s1/jobs/${job.id}`)
    assertEquals(await settled(call), [])
    await assertRejects(() => Deno.stat(masked), Deno.errors.NotFound)
  }))

Deno.test('An edit can be made again in its place, as told now, picked, and the newest deleted', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = await chainOfTwo(root, { imageGenerator: images })
    const edit = (body: object) =>
      call('POST', '/api/sessions/s1/jobs', { kind: 'edit', frameIndex: 1, edit: body })
    // Nothing to make again yet; an instruction is needed, and one crossing a Limit is refused.
    assertEquals((await edit({ retry: true, instruction: 'A hand' })).status, 409)
    assertEquals((await edit({ retry: true })).status, 400)
    assertEquals((await edit({ instruction: ' ' })).status, 400)
    assertEquals((await edit({ instruction: 'A hand', mask: 'not base64!' })).status, 400)
    assertEquals((await edit({ instruction: 'A hand', model: 'missing-model' })).status, 400)
    assertEquals((await edit({ instruction: 'A naked child' })).status, 422)

    await edit({ instruction: 'A hand', mask: MASK })
    assertEquals(await settled(call), [])
    const [, made] = await chainFrames(call)
    await edit({ retry: true, instruction: 'An open hand', mask: btoa('\x89PNG wider') })
    assertEquals(await settled(call), [])
    const [, again] = await chainFrames(call)
    // In its place, from the render, with the next seed, as told now.
    assertEquals(again.edits.length, 1)
    assertNotEquals(again.edits[0].image, made.edits[0].image)
    assertEquals([again.edits[0].seed, again.edits[0].instructions], [
      made.edits[0].seed + 1,
      ['An open hand'],
    ])
    assertEquals([images.edits[1].image, images.edits[1].instruction], [made.image, 'An open hand'])
    const file = (name: string) => call('GET', `/api/sessions/s1/images/${name}`)
    // The edit it replaced goes, its painted area too.
    for (const name of [made.edits[0].image, made.edits[0].mask]) {
      assertEquals((await file(name)).status, 404)
    }
    assertEquals((await file(again.edits[0].image)).status, 200)

    // The render picked again, then the edit deleted: its files go, the render stays picked.
    const pick = (picked: unknown) => call('PUT', '/api/sessions/s1/pictures/1/picked', { picked })
    assertEquals((await pick(2)).status, 409)
    assertEquals((await pick(0)).status, 200)
    assertEquals((await chainFrames(call))[1].picked, 0)
    assertEquals((await pick(1)).status, 200)
    const deleted = await call('DELETE', '/api/sessions/s1/pictures/1/edits/newest')
    assertEquals(deleted.status, 200)
    const [, after] = await chainFrames(call)
    assertEquals([after.edits, after.picked], [undefined, undefined])
    assertEquals((await file(again.edits[0].image)).status, 404)
    assertEquals((await file(again.image)).status, 200)
    assertEquals(
      (await call('DELETE', '/api/sessions/s1/pictures/1/edits/newest')).status,
      409,
    )
  }))

Deno.test('A Chain queues SHARP, TripoSplat and LiTo for one Frame', () =>
  withTempDir(async (root) => {
    const scene = fakeSceneMaker(), figure = fakeFigureMaker(), lito = fakeFigureMaker()
    const { call } = await chainOfTwo(root, { scene, figure, lito })
    for (const kind of ['scene', 'figure', 'lito']) {
      assertEquals(
        (await call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 1 })).status,
        201,
      )
    }
    assertEquals(await settled(call), [])
    const [opening, second] = await chainFrames(call)
    assertMatch(second.scene!.file, /^scene-1-[0-9a-f]{8}\.ply$/)
    assertMatch(second.figure!.file, /^figure-1-[0-9a-f]{8}\.ply$/)
    assertMatch(second.lito!.file, /^lito-1-[0-9a-f]{8}\.ply$/)
    assertEquals([opening.scene, opening.figure, opening.lito], [undefined, undefined, undefined])
    assertEquals(second.scene!.from, second.image)
    assertEquals((await call('GET', `/api/sessions/s1/images/${second.lito!.file}`)).status, 200)
    // A Chain has no Roleplay jobs.
    const picture = await call('POST', '/api/sessions/s1/jobs', { kind: 'picture', frameIndex: 0 })
    assertEquals(picture.status, 409)

    // Undoing the Frame deletes them with its picture.
    await call('DELETE', '/api/sessions/s1/frames/1')
    for (
      const file of [second.image!, second.scene!.file, second.figure!.file, second.lito!.file]
    ) {
      assertEquals((await call('GET', `/api/sessions/s1/images/${file}`)).status, 404)
    }
  }))

Deno.test('The Compare dialog exports to a folder per Session', () =>
  withTempDir(async (root) => {
    const page = '<script id="comparison" type="application/json">{}</script>'
    const exports = {
      dir: join(root, 'exports'),
      page: () => Promise.resolve({ html: page, plot: '' }),
    }
    const { call } = await chainOfTwo(root, { exports })
    const comparison = {
      models: [],
      rows: [{ name: 'Frame 0', pictures: [] }],
    }
    const exported = await call('POST', '/api/sessions/s1/export', comparison)
    assertEquals(await exported.json(), { folder: join(root, 'exports', 's1'), pictures: 0 })
    assertMatch(
      await Deno.readTextFile(join(root, 'exports', 's1', 'index.html')),
      /"title":"\d{1,2} [A-Z][a-z]{2,3} \d{4} · Seed \d+"/,
    )

    const picture = { name: 'Frame 0', pictures: [{ image: '../s2/frame-0.png' }] }
    const outside = await call('POST', '/api/sessions/s1/export', {
      ...comparison,
      models: [{ label: 'A' }],
      rows: [picture],
    })
    assertEquals([outside.status, (await outside.json()).error], [
      400,
      'Pictures must be files in the Session',
    ])
    assertEquals((await call('POST', '/api/sessions/nope/export', comparison)).status, 404)
    const off = (await chainOfTwo(join(root, 'off'))).call
    assertEquals((await off('POST', '/api/sessions/s1/export', comparison)).status, 404)
  }))

Deno.test('A Session switches Image Model, and a Chain Frame by the old one renders again', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = await chainOfTwo(root, { imageGenerator: images })
    const switchTo = (imageModel: unknown) =>
      call('PUT', '/api/sessions/s1/image-model', { imageModel })
    const render = () => call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 1 })

    assertEquals((await switchTo(42)).status, 400)
    const unknown = await switchTo('dall-e')
    assertEquals([unknown.status, (await unknown.json()).error], [
      400,
      'There\'s no Image Model "dall-e"',
    ])
    assertEquals(
      (await call('PUT', '/api/sessions/nope/image-model', { imageModel: 'x' })).status,
      404,
    )

    const switched = await (await switchTo('flux2-klein-4b')).json()
    assertEquals([switched.settings.imageModel, switched.settings.steps], ['flux2-klein-4b', 4])
    const [, before] = await chainFrames(call)
    assertEquals((await render()).status, 201)
    assertEquals(await settled(call), [])
    const [, after] = await chainFrames(call)
    assertEquals(after.pictures.map((p: Picture) => p.image), [before.image, after.image])
    assertEquals(images.prompts.length, 3)
  }))

Deno.test('A Session switches Image Model by name, to one a Backend listed can render', () =>
  withTempDir(async (root) => {
    const switchTo = (call: ReturnType<typeof setup>['call'], imageModel: string) =>
      call('PUT', '/api/sessions/s1/image-model', { imageModel })
    // A Mac with no ComfyUI listed: mflux's models only.
    const { call } = await chainOfTwo(join(root, 'mac'))
    const options = await (await call('GET', '/api/settings/options')).json()
    assertEquals(options.imageBackends, ['mflux'])
    assertEquals((await switchTo(call, 'dall-e')).status, 400)
    const qwen = await (await switchTo(call, 'qwen-image-2.1')).json()
    assertEquals([qwen.settings.imageModel, qwen.settings.steps], ['qwen-image-2.1', 25])
    // A Session keeps only its models; where they run is Settings'.
    assertEquals(Object.keys(qwen.settings).sort(), [
      'imageModel',
      'steps',
      'textModel',
      'thinking',
    ])
    // Picked on a kind of backend, the Session keeps it, as where it would rather render.
    const onMflux = await (await call('PUT', '/api/sessions/s1/image-model', {
      imageModel: 'qwen-image-2.1',
      imageBackend: 'mflux',
    })).json()
    assertEquals([onMflux.settings.imageModel, onMflux.settings.imageBackend], [
      'qwen-image-2.1',
      'mflux',
    ])
    const wrongKind = await call('PUT', '/api/sessions/s1/image-model', {
      imageModel: 'krea-2',
      imageBackend: 'comfyui',
    })
    assertEquals([wrongKind.status, (await wrongKind.json()).error], [
      400,
      'ComfyUI has no Image Model "krea-2"',
    ])
    const noKind = await call('PUT', '/api/sessions/s1/image-model', {
      imageModel: 'qwen-image-2.1',
      imageBackend: 'dall-e',
    })
    assertEquals(noKind.status, 400)
    // A PC: no mflux, a ComfyUI listed.
    const off = { available: false, reason: 'mflux runs only on Apple Silicon Macs' }
    const on = { available: true }
    const comfyui = { id: 'comfyui', kind: 'comfyui' as const, address: '' }
    const pc = (await chainOfTwo(join(root, 'pc'), {
      settings: {
        textModel: 'x',
        backends: [...DEFAULT_SETTINGS.backends, comfyui],
        runOn: { ...DEFAULT_SETTINGS.runOn, images: 'comfyui' },
      },
      features: {
        images: off,
        upscale: off,
        edits: off,
        voices: off,
        scenes: on,
        figures: on,
        lito: off,
        style: off,
      },
    })).call
    assertEquals((await (await pc('GET', '/api/settings/options')).json()).imageBackends, [
      'comfyui',
    ])
    assertEquals((await switchTo(pc, 'fibo-2.0')).status, 200)
    // Krea 2 is mflux's only, which can't run here.
    assertEquals((await switchTo(pc, 'krea-2')).status, 409)
  }))

Deno.test("Every picture by one Image Model is deleted, with its files, but not the Session's own model's", () =>
  withTempDir(async (root) => {
    const { call } = await chainOfTwo(root)
    await call('PUT', '/api/sessions/s1/image-model', { imageModel: 'flux2-klein-4b' })
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 1 })
    await settled(call)
    const frames = async () =>
      ((await (await call('GET', '/api/sessions/s1')).json()).frames as JsonFrame[]).map((f) =>
        f.pictures.map((p: Picture) => p.imageModel)
      )
    assertEquals(await frames(), [['qwen-image-2.1'], ['qwen-image-2.1', 'flux2-klein-4b']])
    const old = (await (await call('GET', '/api/sessions/s1')).json()).frames[0].pictures[0].image
    const file = join(root, 's1', old)
    assertEquals((await Deno.stat(file)).isFile, true)

    assertEquals((await call('DELETE', '/api/sessions/s1/pictures')).status, 400)
    const own = await call('DELETE', '/api/sessions/s1/pictures?imageModel=flux2-klein-4b')
    assertEquals(own.status, 409)
    const deleted = await call('DELETE', '/api/sessions/s1/pictures?imageModel=qwen-image-2.1')
    assertEquals((await deleted.json()).deleted, 2)
    assertEquals(await frames(), [[], ['flux2-klein-4b']])
    assertEquals(await Deno.stat(file).catch(() => null), null)
  }))

Deno.test("A Chain carries on while a job runs, and Undo cancels the undone Frame's jobs", () =>
  withTempDir(async (root) => {
    // LiTo takes until it's let go, or cancelled.
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    const lito = fakeFigureMaker()
    const make = lito.make
    lito.make = async (req, signal, onDownload) => {
      await Promise.race([
        held,
        new Promise((_, no) => signal.addEventListener('abort', () => no(signal.reason))),
      ])
      return make(req, signal, onDownload)
    }
    const { call } = await chainOfTwo(root, { lito })
    await call('POST', '/api/sessions/s1/jobs', { kind: 'lito', frameIndex: 0 })
    // The next Frame isn't held up by the job (its render would wait its turn, so it has none).
    await call('PUT', '/api/sessions/s1/render-frames', { renderFrames: false })
    const next = await readEvents(
      await call('POST', '/api/sessions/s1/frames', { action: 'Kneel' }),
    )
    assertEquals(next.at(-1)![0], 'committed')
    await call('POST', '/api/sessions/s1/jobs', { kind: 'lito', frameIndex: 2 })
    assertEquals((await call('DELETE', '/api/sessions/s1/frames/2')).status, 200)
    release()
    assertEquals(await settled(call), [])
    // Frame 0's figure landed on the Chain as it is now; Frame 2's job went with Frame 2.
    const frames = await chainFrames(call)
    assertEquals(frames.length, 2)
    assertMatch(frames[0].lito!.file, /^lito-0-/)
    assertEquals(lito.made.length, 1)
  }))

Deno.test('A Chain job whose Feature is off is refused, saying why', () =>
  withTempDir(async (root) => {
    const { call, settings } = await chainOfTwo(root, { figure: fakeFigureMaker() })
    const queue = async (kind: string) => {
      const res = await call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 0 })
      return [res.status, (await res.json()).error]
    }
    // Not set up here (on Windows, say).
    assertEquals(await queue('lito'), [409, "LiTo isn't available here: No LiTo was set up"])
    // Set up, but switched off in Settings.
    settings.current = {
      ...settings.current,
      features: { ...settings.current.features, figures: false },
    }
    assertEquals(await queue('figure'), [409, 'TripoSplat is switched off in Settings'])
    assertEquals(await settled(call), [])
  }))

Deno.test('A Chain with rendering off writes prompts, and renders a Frame when asked', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting'), reply('kneeling')]),
      imageGenerator: images,
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    const off = await call('PUT', '/api/sessions/s1/render-frames', { renderFrames: false })
    assertEquals((await off.json()).renderFrames, false)
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Sit' }))
    assertEquals((await chainFrames(call)).map((f) => f.image), [null, null])
    assertEquals(images.prompts.length, 0)

    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 1 })
    assertEquals(await settled(call), [])
    const [opening, second] = await chainFrames(call)
    assertMatch(second.image!, /^frame-1-[0-9a-f]{8}\.png$/)
    assertEquals(opening.image, null)

    // Switched back on, the next Frame renders as it's made.
    await call('PUT', '/api/sessions/s1/render-frames', { renderFrames: true })
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Kneel' }))
    assertMatch((await chainFrames(call))[2].image!, /^frame-2-[0-9a-f]{8}\.png$/)
    assertEquals(images.prompts.length, 2)
  }))

Deno.test('A failed upscale leaves the Frame as it was', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = await chainOfTwo(root, { imageGenerator: images })
    images.upscale = () => Promise.reject(new Error('SeedVR2 upscaler failed: out of memory'))
    await call('POST', '/api/sessions/s1/jobs', { kind: 'upscale', frameIndex: 0 })
    const [failed] = await settled(call)
    assertEquals(failed.error, 'SeedVR2 upscaler failed: out of memory')
    assertEquals((await chainFrames(call))[0].upscaled, undefined)
  }))

Deno.test('Upscale uses the upscaler chosen in Settings now, even mid-Session', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call, settings } = await chainOfTwo(root, { imageGenerator: images })
    settings.current = { ...settings.current, upscaler: 'seedvr2-3b' }
    await call('POST', '/api/sessions/s1/jobs', { kind: 'upscale', frameIndex: 0 })
    await settled(call)
    assertEquals(images.upscalers, ['seedvr2-3b'])
  }))
