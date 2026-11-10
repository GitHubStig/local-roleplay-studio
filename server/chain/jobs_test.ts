import { assertEquals, assertMatch, assertNotEquals } from '@std/assert'
import type { Job } from '../jobs.ts'
import { fakeFigureMaker } from '../3d/testing.ts'
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
  madeFrame,
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
    await madeFrame(call, 'Kneel')
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
    const next = await madeFrame(call, 'Rise')
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
    await madeFrame(call, 'Kneel')
    await madeFrame(call, 'Rise')
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
      'Frame 3 has a job running: wait for it, or cancel it, then delete',
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
    await madeFrame(call, 'Kneel')
    await madeFrame(call, 'Rise')
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
    const next = await readEvents(
      await call('POST', '/api/sessions/s1/frames', { action: 'Kneel', render: false }),
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
    // This browser's switch off, sent with each Action.
    await readEvents(await call('POST', '/api/sessions/s1/frames', { render: false }))
    await readEvents(
      await call('POST', '/api/sessions/s1/frames', { action: 'Sit', render: false }),
    )
    assertEquals((await chainFrames(call)).map((f) => f.image), [null, null])
    assertEquals(images.prompts.length, 0)

    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 1 })
    assertEquals(await settled(call), [])
    const [opening, second] = await chainFrames(call)
    assertMatch(second.image!, /^frame-1-[0-9a-f]{8}\.png$/)
    assertEquals(opening.image, null)

    // Switched back on (the default), the next Frame renders as it's made.
    await madeFrame(call, 'Kneel')
    assertMatch((await chainFrames(call))[2].image!, /^frame-2-[0-9a-f]{8}\.png$/)
    assertEquals(images.prompts.length, 2)
  }))
