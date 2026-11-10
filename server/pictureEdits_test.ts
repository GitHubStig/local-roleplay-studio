import { assertEquals, assertMatch, assertNotEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import type { ImageGenerator } from './images/imageGenerator.ts'
import { fakeImageGenerator, withTempDir } from './testing.ts'
import { chainFrames, chainOfTwo, settled } from './appTesting.ts'

/** A PNG's bytes in base64, standing in for a painted area. */
const MASK = btoa('\x89PNG painted')

Deno.test('An edit repaints a picture as a new version, made from its model’s newest and picked', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = await chainOfTwo(root, {
      imageGenerator: images,
      settings: { textModel: 'x' },
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
    // Quantized as Settings say: 8-bit by default.
    assertEquals(
      [images.edits[0].image, images.edits[0].mask, images.edits[0].quantize],
      [first.image, one.mask, 8],
    )

    // A second, of the whole picture, uses the model selected in the Edit dialog: a line of its
    // own, from the Original.
    assertEquals(
      (await edit({ instruction: 'Warmer light', model: 'flux3-klein-edit' })).status,
      201,
    )
    assertEquals(await settled(call), [])
    const [, second] = await chainFrames(call)
    assertEquals([images.edits[1].image, images.edits[1].mask], [first.image, undefined])
    assertEquals([images.edits[1].model, second.edits[1].editModel, second.edits[1].imageBackend], [
      'flux3-klein-edit',
      'flux3-klein-edit',
      'mflux',
    ])
    assertEquals([second.edits.length, second.picked], [2, 2])
    // Qwen's next carries on from Qwen's newest.
    await edit({ instruction: 'A ring on it', model: 'qwen-image-2.1-edit' })
    assertEquals(await settled(call), [])
    assertEquals(images.edits[2].image, one.image)

    // What's made from the picture is made from the picked version.
    await call('POST', '/api/sessions/s1/jobs', { kind: 'upscale', frameIndex: 1 })
    assertEquals(await settled(call), [])
    const [, third] = await chainFrames(call)
    assertEquals(third.picked, 3)
    assertEquals(images.upscaled, [third.edits[2].image])
    const [, upscaled] = await chainFrames(call)
    assertMatch(upscaled.edits[2].upscaled, /-2048\.png$/)
    assertEquals(upscaled.upscaled, undefined)
    // Edits and their upscales are served, as the render is.
    const served = (name: string) => call('GET', `/api/sessions/s1/images/${name}`)
    for (const name of [one.image, one.mask, upscaled.edits[2].image, upscaled.edits[2].upscaled]) {
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
    const deleted = await call('DELETE', '/api/sessions/s1/pictures/1/edits/1')
    assertEquals(deleted.status, 200)
    const [, after] = await chainFrames(call)
    assertEquals([after.edits, after.picked], [undefined, undefined])
    assertEquals((await file(again.edits[0].image)).status, 404)
    assertEquals((await file(again.image)).status, 200)
    assertEquals(
      (await call('DELETE', '/api/sessions/s1/pictures/1/edits/1')).status,
      409,
    )
  }))

Deno.test('Each edit model’s line is retried and deleted on its own, the others keeping their numbers', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = await chainOfTwo(root, {
      imageGenerator: images,
      settings: { textModel: 'x' },
    })
    const edit = async (body: object) => {
      await call('POST', '/api/sessions/s1/jobs', { kind: 'edit', frameIndex: 1, edit: body })
      assertEquals(await settled(call), [])
      return (await chainFrames(call))[1]
    }
    const qwen = 'qwen-image-2.1-edit', flux = 'flux3-klein-edit'
    await edit({ instruction: 'Q1', model: qwen })
    await edit({ instruction: 'F1', model: flux })
    const made = await edit({ instruction: 'Q2', model: qwen })
    // A retry of FLUX.3's stays second, made again from the Original.
    const retried = await edit({ instruction: 'F1 again', model: flux, retry: true })
    assertEquals(retried.edits.map((e: { instructions: string[] }) => e.instructions[0]), [
      'Q1',
      'F1 again',
      'Q2',
    ])
    assertEquals([retried.picked, images.edits[3].image], [2, made.image])
    const remove = (version: number) =>
      call('DELETE', `/api/sessions/s1/pictures/1/edits/${version}`)
    // Only a line's newest goes.
    assertEquals((await remove(1)).status, 409)
    await call('PUT', '/api/sessions/s1/pictures/1/picked', { picked: 3 })
    // Q2 picked and deleted: Q1, the one before it in its line, is picked.
    assertEquals((await remove(3)).status, 200)
    const [, after] = await chainFrames(call)
    assertEquals([
      after.edits.map((e: { instructions: string[] }) => e.instructions[0]),
      after.picked,
    ], [
      ['Q1', 'F1 again'],
      1,
    ])
    // Q1 deleted while the FLUX.3 edit after it is picked: that stays picked, now first.
    await call('PUT', '/api/sessions/s1/pictures/1/picked', { picked: 2 })
    assertEquals((await remove(1)).status, 200)
    const [, last] = await chainFrames(call)
    assertEquals([last.edits.length, last.edits[0].instructions, last.picked], [1, ['F1 again'], 1])
  }))
