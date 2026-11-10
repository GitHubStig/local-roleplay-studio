import { assertEquals, assertMatch } from '@std/assert'
import { fakeFigureMaker, fakeSceneMaker } from './3d/testing.ts'
import { fakeImageGenerator, withTempDir } from './testing.ts'
import { chainFrames, chainOfTwo, settled } from './appTesting.ts'

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
