import { assertEquals, assertMatch } from '@std/assert'
import { fakeFigureMaker, fakeSceneMaker } from '../3d/testing.ts'
import { fakeImageGenerator, planOf, scriptedTextModel, withTempDir } from '../testing.ts'
import { readEvents, settled, setup, storyboardFrames } from '../appTesting.ts'

Deno.test('A Storyboard Frame upscales once rendered; a re-render replaces the upscale', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([], [], { plans: [planOf(2)] }),
    })
    await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'A dunk.', frameCount: 2 })
    await readEvents(await call('POST', '/api/sessions/s1/plan'))
    await readEvents(await call('POST', '/api/sessions/s1/write'))
    const job = (kind: string) => call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 0 })
    assertEquals((await job('upscale')).status, 409) // nothing to upscale yet

    await job('render')
    await settled(call)
    assertEquals((await job('upscale')).status, 201)
    await settled(call)
    const upscaled = (await storyboardFrames(call))[0].upscaled!
    assertMatch(upscaled, /-2048\.png$/)

    await job('render')
    await settled(call)
    assertEquals((await storyboardFrames(call))[0].upscaled, undefined)
    assertEquals((await call('GET', `/api/sessions/s1/images/${upscaled}`)).status, 404)
  }))

Deno.test('A Restart cancels the renders, waits for the one running, and clears the Frames', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const prompts: string[] = []
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    const holding = {
      ...images,
      async generate(...args: Parameters<typeof images.generate>) {
        prompts.push(args[0].prompt)
        if (prompts.length === 1) await held
        return images.generate(...args)
      },
    }
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([], [], { plans: [planOf(2)] }),
      imageGenerator: holding,
    })
    await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'A dunk.', frameCount: 2 })
    await readEvents(await call('POST', '/api/sessions/s1/plan'))
    await readEvents(await call('POST', '/api/sessions/s1/write'))
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 0 })
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 1 })
    // Frame 0's render is running, Frame 1's queued behind it.
    while (!prompts.length) await new Promise((r) => setTimeout(r, 5))

    let done = false
    const restart = call('POST', '/api/sessions/s1/restart').then((res) => (done = true, res))
    await new Promise((r) => setTimeout(r, 50))
    assertEquals(done, false)
    release()
    assertEquals((await restart).status, 200)
    assertEquals(await settled(call), [])
    assertEquals(prompts.length, 1)
    const frames = await storyboardFrames(call)
    assertEquals(frames.map((f) => [f.body, f.image]), [['', null], ['', null]])
  }))

Deno.test('A Storyboard queues SHARP, TripoSplat and LiTo; a re-render drops them', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([], [], { plans: [planOf(2)] }),
      scene: fakeSceneMaker(),
      figure: fakeFigureMaker(),
      lito: fakeFigureMaker(),
    })
    await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'A dunk.', frameCount: 2 })
    await readEvents(await call('POST', '/api/sessions/s1/plan'))
    await readEvents(await call('POST', '/api/sessions/s1/write'))
    const job = (kind: string) => call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 1 })
    assertEquals((await job('scene')).status, 409) // no picture, and none coming
    // Queued back to back: the 3D waits behind the render that makes its picture.
    await job('render')
    for (const kind of ['scene', 'figure', 'lito']) assertEquals((await job(kind)).status, 201)
    assertEquals(await settled(call), [])
    const made = (await storyboardFrames(call))[1]
    assertMatch(made.scene!.file, /^scene-1-[0-9a-f]{8}\.ply$/)
    assertMatch(made.figure!.file, /^figure-1-[0-9a-f]{8}\.ply$/)
    assertMatch(made.lito!.file, /^lito-1-[0-9a-f]{8}\.ply$/)

    // Edited by hand, the picture and what was made from it stay (stale) until rendered again.
    await call('PUT', '/api/sessions/s1/frames/1', { body: 'He lands.' })
    const edited = (await storyboardFrames(call))[1]
    assertEquals([edited.stale, edited.scene, edited.lito], [true, made.scene, made.lito])
    await job('render')
    await settled(call)
    const rerendered = (await storyboardFrames(call))[1]
    assertEquals([rerendered.stale, rerendered.scene, rerendered.figure], [
      undefined,
      undefined,
      undefined,
    ])
    assertEquals((await call('GET', `/api/sessions/s1/images/${made.scene!.file}`)).status, 404)
  }))
