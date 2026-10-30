import { assertEquals, assertMatch, assertNotEquals } from '@std/assert'
import { join } from '@std/path'
import { callFile, type CallRecord, loggedVoice } from '../calls.ts'
import { fakeFigureMaker, fakeSceneMaker } from '../3d/testing.ts'
import { fakeVoiceEngine } from '../voice/testing.ts'
import { replyOf, scriptedRoleplayModel, testCast, testLook } from './testing.ts'
import { fakeImageGenerator, withTempDir } from '../testing.ts'
import { readEvents, settled, setup, type SetupOptions, shown } from '../appTesting.ts'

/** A begun Roleplay whose Art Agent will write `bodies` in turn. */
async function roleplayWithArt(
  root: string,
  bodies: string[],
  extra: Partial<SetupOptions> = {},
) {
  const harness = setup({
    root,
    settings: { textModel: 'x' },
    roleplayModel: scriptedRoleplayModel({
      casts: [testCast],
      replies: [replyOf('You are late.'), replyOf('Take the wheel.')],
      looks: [testLook('Ink.', 'Mira Vance, 34.', 'Sam Reyes, 25.')],
      bodies,
    }),
    ...extra,
  })
  const { call } = harness
  await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
  await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
  await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin'))
  return harness
}

const artBody = 'Mira waits. She frowns. A wide shot. A navy coat. The bridge. Lamplight. Blues.'

Deno.test('Picturing, rendering and upscaling a Roleplay Frame are queued jobs, run in order', () =>
  withTempDir(async (root) => {
    const { call } = await roleplayWithArt(root, [artBody])
    assertEquals((await call('PUT', '/api/sessions/s1/roleplay/look', {})).status, 409)
    const enqueue = (kind: string, frameIndex = 0) =>
      call('POST', '/api/sessions/s1/jobs', { kind, frameIndex })
    assertEquals((await enqueue('picture', 5)).status, 404)
    assertEquals((await enqueue('paint')).status, 400)

    // Queued back to back: the render waits for the picture, the upscale for the render.
    const queued = await (await enqueue('picture')).json()
    await enqueue('render')
    await enqueue('upscale')
    assertEquals(queued.length, 1)
    assertEquals(await settled(call), [])

    const session = await (await call('GET', '/api/sessions/s1')).json()
    const frame = shown(session.frames[0])
    assertEquals(frame.prompt, `Mira Vance, 34. Sam Reyes, 25. ${artBody} Ink.`)
    assertEquals((await call('GET', `/api/sessions/s1/images/${frame.image}`)).status, 200)
    assertMatch(frame.upscaled, /-2048\.png$/)

    const look = await call(
      'PUT',
      '/api/sessions/s1/roleplay/look',
      testLook('Watercolour.', 'Mira Vance, 34.', 'Sam Reyes, 25.'),
    )
    assertEquals(shown((await look.json()).frames[0]).stale, true)
    const [card] = await (await call('GET', '/api/sessions')).json()
    assertEquals(card.latestImage, frame.image)
  }))

Deno.test('A picture goes ahead of queued renders, and Clear empties the queue', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    const holding = {
      ...images,
      async generate(...args: Parameters<typeof images.generate>) {
        const signal = args[1]
        await Promise.race([
          held,
          new Promise((_, no) => signal.addEventListener('abort', () => no(signal.reason))),
        ])
        return images.generate(...args)
      },
    }
    const { call } = await roleplayWithArt(root, [artBody, artBody], { imageGenerator: holding })
    const enqueue = (kind: string, frameIndex: number) =>
      call('POST', '/api/sessions/s1/jobs', { kind, frameIndex })
    await enqueue('picture', 0)
    await settled(call)
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Sorry.' }))
    // Frame 0's render holds the queue; Frame 1's is queued behind it, then its picture.
    await enqueue('render', 0)
    await enqueue('render', 1)
    const jobs = await (await enqueue('picture', 1)).json()
    assertEquals(
      jobs.map((j: { kind: string; frameIndex: number }) => `${j.kind} ${j.frameIndex}`),
      ['picture 0', 'render 0', 'picture 1', 'render 1'],
    )
    assertEquals(jobs[0].status, 'done')

    // Clear queue cancels what's open and leaves what's done, to be seen.
    assertEquals((await call('DELETE', '/api/sessions/s1/jobs')).status, 200)
    release()
    assertEquals(await settled(call), [])
    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(session.frames.map((f: { pictures: unknown[] }) => f.pictures.length), [0, 0])
    assertEquals(session.frames[1].prompt, undefined)
    const left = await (await call('GET', '/api/sessions/s1/jobs')).json()
    assertEquals(left.map((j: { kind: string; status: string }) => `${j.kind} ${j.status}`), [
      'picture done',
    ])
  }))

Deno.test('A done job stays listed until dismissed, and is no work in progress', () =>
  withTempDir(async (root) => {
    const { call } = await roleplayWithArt(root, [artBody, artBody])
    const enqueue = () => call('POST', '/api/sessions/s1/jobs', { kind: 'picture', frameIndex: 0 })
    const first = (await (await enqueue()).json())[0]
    await settled(call)
    const listed = await (await call('GET', '/api/sessions/s1/jobs')).json()
    assertEquals([listed[0].id, listed[0].status], [first.id, 'done'])
    // Asked for again, it's made again: a new job beside the done one.
    const again = await (await enqueue()).json()
    assertEquals(again.length, 2)
    await settled(call)
    const dismissed = await call('DELETE', '/api/sessions/s1/jobs/done')
    assertEquals(await dismissed.json(), [])
  }))

Deno.test('A failed job stays listed to retry or dismiss', () =>
  withTempDir(async (root) => {
    const { call } = await roleplayWithArt(root, [])
    // Rendering a Frame that was never pictured fails.
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 0 })
    const [failed] = await settled(call)
    assertEquals([failed.status, failed.error], ['failed', "Frame 1 isn't pictured yet"])
    // Kept, so it can be retried: back in the queue, where it fails again (still no picture).
    const retried = await call('POST', `/api/sessions/s1/jobs/${failed.id}/retry`)
    assertEquals(retried.status, 200)
    const [again] = await settled(call)
    assertEquals([again.id, again.status], [failed.id, 'failed'])
    assertEquals((await call('POST', '/api/sessions/s1/jobs/nope/retry')).status, 404)
    const dismissed = await call('DELETE', `/api/sessions/s1/jobs/${failed.id}`)
    assertEquals(await dismissed.json(), [])
    assertEquals((await call('DELETE', '/api/sessions/s1/jobs/nope')).status, 404)
  }))

Deno.test('A Roleplay Frame is pictured with Pictures off, but not rendered', () =>
  withTempDir(async (root) => {
    const { call, settings } = await roleplayWithArt(root, [artBody])
    settings.current = {
      ...settings.current,
      features: { ...settings.current.features, images: false },
    }
    const queue = (kind: string) => call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 0 })
    assertEquals((await queue('picture')).status, 201)
    assertEquals(await settled(call), [])
    const render = await queue('render')
    assertEquals([render.status, (await render.json()).error], [
      409,
      'Pictures is switched off in Settings',
    ])
    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertMatch(session.frames[0].prompt, /Mira waits\./)
  }))

Deno.test('The conversation carries on while a job runs, and neither overwrites the other', () =>
  withTempDir(async (root) => {
    let release!: () => void
    const images = fakeImageGenerator()
    const held = new Promise<void>((r) => (release = r))
    const slow = {
      ...images,
      async generate(...args: Parameters<typeof images.generate>) {
        await held
        return images.generate(...args)
      },
    }
    const { call } = await roleplayWithArt(root, [artBody], { imageGenerator: slow })
    await call('POST', '/api/sessions/s1/jobs', { kind: 'picture', frameIndex: 0 })
    await settled(call)
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 0 })
    await new Promise((r) => setTimeout(r, 20))

    // The render is running; a Message still goes through.
    const talk = await readEvents(
      await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Sorry.' }),
    )
    assertEquals(talk.at(-1)![0], 'replied')
    release()
    await settled(call)
    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(session.frames.length, 2)
    assertMatch(shown(session.frames[0]).image, /^frame-0-/)
  }))

Deno.test('Undoing an exchange cancels its jobs; deleting the Roleplay cancels them all', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator({ hang: true })
    const { call } = await roleplayWithArt(root, [artBody, artBody], { imageGenerator: images })
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Sorry.' }))
    for (const frameIndex of [1, 1]) {
      await call('POST', '/api/sessions/s1/jobs', { kind: 'picture', frameIndex })
    }
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 1 })
    // The pictures written, the render hangs.
    while (!images.prompts.length) await new Promise((r) => setTimeout(r, 5))
    assertEquals((await call('DELETE', '/api/sessions/s1/roleplay/frames/1')).status, 200)
    assertEquals(await settled(call), [])
  }))

Deno.test('Restarting a Roleplay takes it back to its Cast, deleting every exchange and picture', () =>
  withTempDir(async (root) => {
    const { call } = await roleplayWithArt(root, [artBody])
    await call('POST', '/api/sessions/s1/jobs', { kind: 'picture', frameIndex: 0 })
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 0 })
    await settled(call)
    const before = await (await call('GET', '/api/sessions/s1')).json()
    const { image } = shown(before.frames[0])
    assertEquals(await Deno.stat(`${root}/s1/${image}`).then(() => true, () => false), true)

    const restarted = await (await call('POST', '/api/sessions/s1/restart')).json()
    assertEquals(restarted.frames, [])
    assertEquals(restarted.cast, before.cast)
    assertEquals(restarted.look, before.look)
    assertEquals(await Deno.stat(`${root}/s1/${image}`).then(() => true, () => false), false)
    // Back to reviewing the Cast: nothing to restart, nothing to reply to, but it can begin.
    assertEquals((await call('POST', '/api/sessions/s1/restart')).status, 409)
    assertEquals(
      (await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Hi' })).status,
      409,
    )
    const begun = await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin'))
    assertEquals(begun.at(-1)![0], 'replied')
  }))

Deno.test("Speaking a Frame designs the Character's voice first, and serves the audio", () =>
  withTempDir(async (root) => {
    const voice = fakeVoiceEngine()
    const model = scriptedRoleplayModel({
      casts: [testCast],
      replies: [replyOf('You are late.'), replyOf('...')],
      voices: ['A low, husky woman.'],
    })
    const { call } = setup({ root, settings: { textModel: 'x' }, roleplayModel: model, voice })
    await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin'))
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Sorry.' }))
    const job = (kind: string, frameIndex: number) =>
      call('POST', '/api/sessions/s1/jobs', { kind, frameIndex })
    assertEquals((await job('speak', 1)).status, 409)

    assertEquals((await job('speak', 0)).status, 201)
    assertEquals(await settled(call), [])
    let session = await (await call('GET', '/api/sessions/s1')).json()
    const { ref } = session.voice
    assertEquals(session.voice, {
      description: 'A low, husky woman.',
      model: 'scripted',
      ref,
      takes: 1,
    })
    assertEquals(session.frames[0].speech.ref, ref)
    const audio = await call('GET', `/api/sessions/s1/images/${session.frames[0].speech.file}`)
    assertEquals([audio.status, audio.headers.get('Content-Type')], [200, 'audio/mpeg'])
    assertMatch(session.frames[0].speech.file, /^speech-0-[0-9a-f]{8}\.mp3$/)
    assertMatch(await audio.text(), /fake speak: You are late\./)

    // A new description drops the voice; the next take designs it from that description.
    const put = await call('PUT', '/api/sessions/s1/roleplay/voice', { description: 'A deep man.' })
    assertEquals((await put.json()).voice, { description: 'A deep man.' })
    assertEquals((await call('PUT', '/api/sessions/s1/roleplay/voice', {})).status, 400)
    await job('voice', 0)
    assertEquals(await settled(call), [])
    session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(session.voice.description, 'A deep man.')
    assertEquals(voice.calls.map((c) => c.kind), ['design', 'speak', 'design'])
    assertEquals((voice.calls[2].req as { description: string }).description, 'A deep man.')
  }))

Deno.test("The call log puts a voice's design with the setup, and a spoken line with its Frame", () =>
  withTempDir(async (root) => {
    const voice = loggedVoice(fakeVoiceEngine(), 'fake')
    const model = scriptedRoleplayModel({
      casts: [testCast],
      replies: [replyOf('You are late.')],
      voices: ['A low, husky woman.'],
    })
    const { call } = setup({
      root,
      settings: { textModel: 'x', callLog: true },
      roleplayModel: model,
      voice,
    })
    await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin'))
    await call('POST', '/api/sessions/s1/jobs', { kind: 'voice', frameIndex: 0 })
    await settled(call)
    await call('POST', '/api/sessions/s1/jobs', { kind: 'speak', frameIndex: 0 })
    await settled(call)
    const jobs = async (frame: number | null) =>
      (JSON.parse(await Deno.readTextFile(callFile(join(root, 's1'), frame))) as CallRecord[])
        .map((c) => c.job)
    assertEquals(await jobs(null), ['voice-design'])
    assertEquals(await jobs(0), ['speak'])
  }))

Deno.test('Without a voice service, speaking fails with a reason', () =>
  withTempDir(async (root) => {
    const { call } = await roleplayWithArt(root, [])
    const res = await call('POST', '/api/sessions/s1/jobs', { kind: 'speak', frameIndex: 0 })
    assertEquals([res.status, (await res.json()).error], [
      409,
      "Voices isn't available here: No voice service was set up; or add a ComfyUI in Settings, on the Machines tab",
    ])
  }))

Deno.test('A rendered Frame makes a 3D scene, served; a re-render or Undo removes it', () =>
  withTempDir(async (root) => {
    const scene = fakeSceneMaker()
    const { call } = await roleplayWithArt(root, [artBody, artBody], { scene })
    const job = (kind: string, frameIndex: number) =>
      call('POST', '/api/sessions/s1/jobs', { kind, frameIndex })
    assertEquals((await job('scene', 0)).status, 409)

    await job('picture', 0)
    await job('render', 0)
    assertEquals(await settled(call), [])
    await job('scene', 0)
    assertEquals(await settled(call), [])
    let frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[0])
    assertEquals(scene.made.map((m) => m.image), [join(root, 's1', frame.image)])
    assertMatch(frame.scene.file, /^scene-0-[0-9a-f]{8}\.ply$/)
    assertEquals([frame.scene.splats, frame.scene.pivot, frame.scene.fov], [4, 1.5, 51.3])
    assertEquals(frame.scene.from, frame.image)
    const ply = await call('GET', `/api/sessions/s1/images/${frame.scene.file}`)
    assertEquals([ply.status, await ply.text()], [200, `ply fake scene of ${scene.made[0].image}`])

    // Made again, it replaces the old file; a re-render drops it.
    const first = frame.scene.file
    await job('scene', 0)
    await settled(call)
    frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[0])
    assertNotEquals(frame.scene.file, first)
    assertEquals((await call('GET', `/api/sessions/s1/images/${first}`)).status, 404)
    const second = frame.scene.file
    await job('render', 0)
    await settled(call)
    frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[0])
    assertEquals(frame.scene, undefined)
    assertEquals((await call('GET', `/api/sessions/s1/images/${second}`)).status, 404)

    // Undoing an exchange removes its scene.
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Sorry.' }))
    await job('picture', 1)
    await job('render', 1)
    await settled(call)
    await job('scene', 1)
    await settled(call)
    frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[1])
    await call('DELETE', '/api/sessions/s1/roleplay/frames/1')
    assertEquals((await call('GET', `/api/sessions/s1/images/${frame.scene.file}`)).status, 404)
  }))

Deno.test('A scene is made from the upscale when there is one', () =>
  withTempDir(async (root) => {
    const scene = fakeSceneMaker()
    const { call } = await roleplayWithArt(root, [artBody], { scene })
    for (const kind of ['picture', 'render', 'upscale', 'scene']) {
      await call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 0 })
      assertEquals(await settled(call), [])
    }
    const frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[0])
    assertMatch(frame.upscaled, /-2048\.png$/)
    assertEquals(frame.scene.from, frame.upscaled)
    assertEquals(scene.made[0].image, join(root, 's1', frame.upscaled))
  }))

Deno.test('A figure lifted from a Frame is served, and goes with a re-render', () =>
  withTempDir(async (root) => {
    const figure = fakeFigureMaker()
    const { call } = await roleplayWithArt(root, [artBody], { figure })
    const job = (kind: string) => call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 0 })
    assertEquals((await job('figure')).status, 409)
    for (const kind of ['picture', 'render', 'figure']) {
      await job(kind)
      assertEquals(await settled(call), [])
    }
    let frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[0])
    assertEquals(frame.figure.from, frame.image)
    assertMatch(frame.figure.file, /^figure-0-[0-9a-f]{8}\.ply$/)
    const ply = await call('GET', `/api/sessions/s1/images/${frame.figure.file}`)
    assertEquals(ply.status, 200)
    const file = frame.figure.file
    await job('render')
    await settled(call)
    frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[0])
    assertEquals(frame.figure, undefined)
    assertEquals((await call('GET', `/api/sessions/s1/images/${file}`)).status, 404)
  }))

Deno.test('A LiTo figure is kept beside the TripoSplat one, served, and goes with a re-render', () =>
  withTempDir(async (root) => {
    const figure = fakeFigureMaker(), lito = fakeFigureMaker()
    const { call } = await roleplayWithArt(root, [artBody], { figure, lito })
    const job = (kind: string) => call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 0 })
    assertEquals((await job('lito')).status, 409)
    for (const kind of ['picture', 'render', 'figure', 'lito']) {
      await job(kind)
      assertEquals(await settled(call), [])
    }
    let frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[0])
    assertMatch(frame.figure.file, /^figure-0-[0-9a-f]{8}\.ply$/)
    assertMatch(frame.lito.file, /^lito-0-[0-9a-f]{8}\.ply$/)
    assertEquals([figure.made.length, lito.made.length], [1, 1])
    assertEquals((await call('GET', `/api/sessions/s1/images/${frame.lito.file}`)).status, 200)
    const file = frame.lito.file
    await job('render')
    await settled(call)
    frame = shown((await (await call('GET', '/api/sessions/s1')).json()).frames[0])
    assertEquals([frame.figure, frame.lito], [undefined, undefined])
    assertEquals((await call('GET', `/api/sessions/s1/images/${file}`)).status, 404)
  }))

Deno.test('Without SHARP, making a scene fails with a reason', () =>
  withTempDir(async (root) => {
    const { call } = await roleplayWithArt(root, [artBody])
    for (const kind of ['picture', 'render']) {
      await call('POST', '/api/sessions/s1/jobs', { kind, frameIndex: 0 })
      await settled(call)
    }
    const res = await call('POST', '/api/sessions/s1/jobs', { kind: 'scene', frameIndex: 0 })
    assertEquals((await res.json()).error, "SHARP isn't available here: No SHARP was set up")
  }))

Deno.test('Pictures use the Art Agent model set in Settings, recorded on the Frame', () =>
  withTempDir(async (root) => {
    const artist = scriptedRoleplayModel({
      name: 'artist',
      looks: [testLook('Ink.', 'Mira Vance, 34.', 'Sam Reyes, 25.')],
      bodies: [artBody],
    })
    const { call, settings } = await roleplayWithArt(root, [], { roleplayModels: { artist } })
    settings.current = { ...settings.current, artModel: 'artist' }
    await call('POST', '/api/sessions/s1/jobs', { kind: 'picture', frameIndex: 0 })
    assertEquals(await settled(call), [])
    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals([session.lookModel, session.frames[0].pictureModel], ['artist', 'artist'])
    assertEquals(artist.art.length, 2)
  }))

Deno.test('A voice is designed while the Cast is reviewed, before the scene begins', () =>
  withTempDir(async (root) => {
    const voice = fakeVoiceEngine()
    const model = scriptedRoleplayModel({ casts: [testCast], voices: ['A low, husky woman.'] })
    const { call } = setup({ root, settings: { textModel: 'x' }, roleplayModel: model, voice })
    await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    const job = (kind: string, frameIndex: number) =>
      call('POST', '/api/sessions/s1/jobs', { kind, frameIndex })
    // No Frame yet: a voice is the Session's, so it's queued all the same; a line isn't.
    assertEquals((await job('voice', 0)).status, 201)
    assertEquals((await job('speak', 0)).status, 404)
    assertEquals((await job('voice', 1)).status, 404)
    assertEquals(await settled(call), [])
    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals([session.frames.length, session.voice.description], [0, 'A low, husky woman.'])
    assertEquals(voice.calls.map((c) => c.kind), ['design'])
  }))
