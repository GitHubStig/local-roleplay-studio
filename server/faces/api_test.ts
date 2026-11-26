import { assert, assertEquals } from '@std/assert'
import { fakeImageGenerator, planOf, scriptedTextModel, withTempDir } from '../testing.ts'
import { fakeHeadFinder } from '../heads/testing.ts'
import { replyOf, scriptedRoleplayModel, testCast, testLook } from '../roleplay/testing.ts'
import {
  getSession,
  listJobs,
  readEvents,
  refusalIn,
  sessionFrom,
  settled,
  setup,
} from '../appTesting.ts'
import type { Availabilities } from '../../shared/features.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import encodePng from '@jsquash/png/encode.js'
import { Uint8ArrayReader, ZipReader } from '@zip-js/zip-js'
import { clonedIn } from '../appTesting.ts'
import { KEEP_ALL } from '../../shared/keep.ts'

const on = { available: true }
const features: Availabilities = {
  images: on,
  upscale: on,
  edits: on,
  voices: on,
  scenes: on,
  figures: on,
  lito: on,
  style: on,
  video: on,
  sheets: on,
}
const SHEETS_ON = { ...DEFAULT_SETTINGS.features, sheets: true }
const ACE = { label: 'Ace', box: [300, 100, 600, 400] as [number, number, number, number] }

/** A Storyboard of two Frames, Ace in the first and no one in the second, planned with sheets. */
async function planned(
  root: string,
  heads = fakeHeadFinder({ found: [[ACE], [ACE], [ACE]] }),
) {
  const images = fakeImageGenerator({ pictures: true })
  const plan = planOf(2)
  plan.beats[1].shown = []
  const app = setup({
    root,
    settings: { textModel: 'x', features: SHEETS_ON },
    features,
    imageGenerator: images,
    headFinder: heads,
    textModel: scriptedTextModel([], { plans: [plan] }),
  })
  await app.call('POST', '/api/sessions', {
    kind: 'storyboard',
    brief: 'A first dunk.',
    frameCount: 2,
  })
  await readEvents(await app.call('POST', '/api/sessions/s1/plan'))
  return { ...app, images, heads }
}

Deno.test("A rendered Frame's faces are repainted from its sheets, the render kept beside them", () =>
  withTempDir(async (root) => {
    const { call, images } = await planned(root)
    assertEquals(await settled(call), [])
    await readEvents(await call('POST', '/api/sessions/s1/write'))
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 0 })
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 1 })
    assertEquals(await settled(call), [])

    const session = await getSession(call, 'storyboard')
    const [ace] = session.sheets
    const picture = session.frames[0].pictures[0]
    const faces = picture.faces!
    assertEquals([faces.subjects, faces.without, faces.seed], [
      ['Ace'],
      false,
      session.seed + 1,
    ])
    assert(picture.file !== faces.other!.file)
    // The face edit: on the render, by the face pass's model, with the view of Ace's sheet nearest
    // the head's turn (the three-quarter, as none was said), and the expression.
    const edit = images.edits[0]
    assertEquals([edit.image, edit.references, edit.seed], [
      faces.other!.file,
      [ace.made!.views[1]],
      session.seed + 1,
    ])
    assert(edit.instruction.includes('(Calm)'), edit.instruction)
    // Both served.
    for (const file of [picture.file, faces.other!.file]) {
      const served = await call('GET', `/api/sessions/s1/images/${file}`)
      await served.body?.cancel()
      assertEquals(served.status, 200, file)
    }
    // The job says whose faces; the Frame with no one in it, that it was saved as rendered.
    const jobs = await listJobs(call)
    assertEquals(
      jobs.filter((j) => j.kind === 'render').map((j) => [j.frameIndex, j.faces]),
      [
        [0, { subjects: ['Ace'] }],
        [1, { subjects: [], skipped: 'No one with a sheet in it: saved as rendered.' }],
      ],
    )
    assertEquals(session.frames[1].pictures[0].faces, undefined)

    // Without the face pass: the render is the picture; and back.
    const without = await sessionFrom(
      await call('PUT', '/api/sessions/s1/pictures/0/faces', { without: true }),
    )
    const used = without.frames[0].pictures[0]
    assertEquals([used.file, used.faces?.without, used.faces?.other?.file], [
      faces.other!.file,
      true,
      picture.file,
    ])
    const back = await sessionFrom(
      await call('PUT', '/api/sessions/s1/pictures/0/faces', { without: false }),
    )
    assertEquals(back.frames[0].pictures[0].file, picture.file)
    const none = await call('PUT', '/api/sessions/s1/pictures/1/faces', { without: true })
    assertEquals((await refusalIn(none)).error, "Frame 2's picture had no face pass")

    // An edit made from the faces is seeded one on from the pass (then has a face pass of its own).
    await call('POST', '/api/sessions/s1/jobs', {
      kind: 'edit',
      frameIndex: 0,
      edit: { instruction: 'A red cap.' },
    })
    assertEquals(await settled(call), [])
    assertEquals(images.edits.at(-2)!.seed, faces.seed + 1)

    // Rendered again: the face pass again, the old faces and render gone.
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 0 })
    assertEquals(await settled(call), [])
    const again = (await getSession(call, 'storyboard')).frames[0].pictures[0]
    assert(again.faces && again.faces.other!.file !== faces.other!.file)
    const left = (await Array.fromAsync(Deno.readDir(`${root}/s1`))).map((e) => e.name)
    assertEquals([left.includes(picture.file), left.includes(faces.other!.file)], [false, false])
  }))

Deno.test("Writing a Storyboard's Frames waits for the sheets its Beats need", () =>
  withTempDir(async (root) => {
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    const { call, images } = await planned(root)
    assertEquals(await settled(call), [])
    const generate = images.generate.bind(images)
    images.generate = async (...args) => {
      await held
      return await generate(...args)
    }
    // Ace's sheet made again, held while it renders.
    await call('POST', '/api/sessions/s1/sheets/Ace/redo')
    const writing = call('POST', '/api/sessions/s1/write').then(readEvents)
    await new Promise((r) => setTimeout(r, 20))
    release()
    const events = await writing
    assertEquals(events[0], ['waiting-for-sheets', {
      type: 'waiting-for-sheets',
      subjects: ['Ace'],
    }])
    const session = await getSession(call, 'storyboard')
    assert(session.sheets[0].made, 'the sheet was made before the Frames were written')
  }))

Deno.test("A Roleplay's first picture waits for its sheets, then has its faces repainted", () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator({ pictures: true })
    const mira = {
      label: 'Mira Vance',
      box: [100, 100, 300, 300] as [number, number, number, number],
    }
    const { call } = setup({
      root,
      settings: { textModel: 'x', features: SHEETS_ON },
      features,
      imageGenerator: images,
      headFinder: fakeHeadFinder({ found: [[mira], []] }),
      roleplayModel: scriptedRoleplayModel({
        casts: [testCast],
        replies: [replyOf('You are late.')],
        looks: [testLook('Ink.', 'Mira Vance, 34.', 'Sam Reyes, 25.')],
        bodies: [{ body: 'Mira glares at Sam.', expression: 'Mira glares at Sam.' }],
      }),
    })
    await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    // Begun at once: the render queued behind the sheets, not run before them.
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin', { render: true }))
    assertEquals(await settled(call), [])
    const jobs = await listJobs(call)
    const ended = (kind: string) => jobs.filter((j) => j.kind === kind).map((j) => j.endedAt!)
    const render = jobs.find((j) => j.kind === 'render')!
    assert(
      ended('sheet').every((at) => at <= render.startedAt!),
      'the render waited for the sheets',
    )
    // Mira found and repainted; Sam's head not found.
    assertEquals(render.faces, { subjects: ['Mira Vance'], missed: ['Sam Reyes'] })
    const picture = (await getSession(call, 'roleplay')).frames[0].pictures[0]
    assertEquals(picture.faces?.subjects, ['Mira Vance'])
    assert(images.edits[0].instruction.includes('(Mira glares at Sam)'))
  }))

/** A painted area of 100×100, white over the square from `from` to `to` (in thousandths), in base64. */
async function areaOver(from: number, to: number): Promise<string> {
  const rgba = new Uint8ClampedArray(100 * 100 * 4)
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 100; x++) {
      const v = x * 10 >= from && x * 10 < to && y * 10 >= from && y * 10 < to ? 255 : 0
      rgba.set([v, v, v, 255], (y * 100 + x) * 4)
    }
  }
  const png = new Uint8Array(await encodePng(new ImageData(rgba, 100, 100)))
  return btoa(String.fromCharCode(...png))
}

/** A Storyboard planned with sheets, its first Frame rendered with its face pass. */
async function rendered(root: string, finds: number) {
  const app = await planned(root, fakeHeadFinder({ found: Array(finds).fill([ACE]) }))
  assertEquals(await settled(app.call), [])
  await readEvents(await app.call('POST', '/api/sessions/s1/write'))
  await app.call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 0 })
  assertEquals(await settled(app.call), [])
  return app
}

const editJobs = async (call: Parameters<typeof listJobs>[0]) =>
  (await listJobs(call)).filter((j) => j.kind === 'edit')

Deno.test('An edit of the whole picture, as a camera move is, has a face pass of its own', () =>
  withTempDir(async (root) => {
    const { call, images } = await rendered(root, 3)
    const faced = (await getSession(call, 'storyboard')).frames[0].pictures[0]
    await call('POST', '/api/sessions/s1/jobs', {
      kind: 'edit',
      frameIndex: 0,
      edit: { instruction: 'A low angle, looking up at the man.' },
    })
    assertEquals(await settled(call), [])
    const session = await getSession(call, 'storyboard')
    const picture = session.frames[0].pictures[0]
    const edit = picture.edits![0]
    // The player's edit on the faces, as told and with no sheet; then the face pass on its result.
    const [, told, face] = images.edits
    assertEquals([told.image, told.references, told.seed], [
      faced.file,
      undefined,
      faced.faces!.seed + 1,
    ])
    assertEquals([face.image, face.seed, face.references?.length], [
      edit.faces!.other!.file,
      edit.seed + 1,
      1,
    ])
    assertEquals([picture.picked, edit.faces!.subjects, edit.faces!.seed, edit.faces!.without], [
      1,
      ['Ace'],
      edit.seed + 1,
      false,
    ])
    assertEquals((await editJobs(call))[0].faces, { subjects: ['Ace'] })
    // An edit of the whole picture is told as a render's pass is: the Frame's expression named.
    assert(face.instruction.includes('(Calm)'), face.instruction)

    // Without the face pass, for the edit the Frame shows; and back.
    const without = await sessionFrom(
      await call('PUT', '/api/sessions/s1/pictures/0/faces', { without: true }),
    )
    const used = without.frames[0].pictures[0].edits![0]
    assertEquals([used.file, used.faces!.other!.file], [edit.faces!.other!.file, edit.file])
    // The render's own face pass is as it was.
    assertEquals(without.frames[0].pictures[0].faces, faced.faces)
    await call('PUT', '/api/sessions/s1/pictures/0/faces', { without: false })

    // An edit made from it is seeded one on from its face pass.
    await call('POST', '/api/sessions/s1/jobs', {
      kind: 'edit',
      frameIndex: 0,
      edit: { instruction: 'A red cap.', mask: await areaOver(0, 100) },
    })
    assertEquals(await settled(call), [])
    assertEquals(images.edits.at(-1)!.seed, edit.faces!.seed + 1)

    // Deleting the newest edit takes its face pass's picture with it.
    const newest = (await getSession(call, 'storyboard')).frames[0].pictures[0].edits![1]
    await call('DELETE', '/api/sessions/s1/pictures/0/edits/2')
    await call('DELETE', '/api/sessions/s1/pictures/0/edits/1')
    const left = (await Array.fromAsync(Deno.readDir(`${root}/s1`))).map((e) => e.name)
    for (const file of [edit.file, edit.faces!.other!.file, newest.file]) {
      assert(!left.includes(file), file)
    }
  }))

Deno.test('An edit whose painted area touches no face keeps the faces it had', () =>
  withTempDir(async (root) => {
    const { call, images } = await rendered(root, 3)
    // Ace's head is at 300–600 across, 100–400 down: the corner misses it.
    await call('POST', '/api/sessions/s1/jobs', {
      kind: 'edit',
      frameIndex: 0,
      edit: { instruction: 'A red cap.', mask: await areaOver(0, 150) },
    })
    assertEquals(await settled(call), [])
    const edit = (await getSession(call, 'storyboard')).frames[0].pictures[0].edits![0]
    assertEquals(edit.faces, undefined)
    assertEquals(images.edits.length, 2, 'the face pass of the render, then the edit, no more')
    assertEquals((await editJobs(call))[0].faces, {
      subjects: [],
      skipped: 'The edit touched no face: its faces are as they were.',
      untouched: true,
    })

    // One over the head has one.
    await call('POST', '/api/sessions/s1/jobs', {
      kind: 'edit',
      frameIndex: 0,
      edit: { instruction: 'A red cap.', mask: await areaOver(300, 500) },
    })
    assertEquals(await settled(call), [])
    const over = (await getSession(call, 'storyboard')).frames[0].pictures[0].edits![1]
    assertEquals(over.faces?.subjects, ['Ace'])
    // Told to keep what the edit changed, not the Frame's expression, which it may have changed.
    const told = images.edits.at(-1)!.instruction
    assert(told.includes('keep what was changed in image 1: A red cap.'), told)
    assert(!told.includes('(Calm)'), told)
    // Made again (Redo), the edit it replaces goes with the picture before its face pass.
    await call('POST', '/api/sessions/s1/jobs', {
      kind: 'edit',
      frameIndex: 0,
      edit: { instruction: 'A blue cap.', mask: await areaOver(300, 500), retry: true },
    })
    assertEquals(await settled(call), [])
    const left = (await Array.fromAsync(Deno.readDir(`${root}/s1`))).map((e) => e.name)
    for (const file of [over.file, over.faces!.other!.file]) assert(!left.includes(file), file)
  }))

Deno.test("Export and Clone carry the faces and the pictures before them, a render's and an edit's", () =>
  withTempDir(async (root) => {
    const { call } = await rendered(root, 3)
    await call('POST', '/api/sessions/s1/jobs', {
      kind: 'edit',
      frameIndex: 0,
      edit: { instruction: 'A low angle, looking up at the man.' },
    })
    assertEquals(await settled(call), [])
    const picture = (await getSession(call, 'storyboard')).frames[0].pictures[0]
    const edit = picture.edits![0]
    const both = [picture.file, picture.faces!.other!.file, edit.file, edit.faces!.other!.file]

    const zipped = async (query = '') => {
      const res = await call('GET', `/api/sessions/s1/export${query}`)
      const zip = new Uint8Array(await res.arrayBuffer())
      return (await new ZipReader(new Uint8ArrayReader(zip)).getEntries()).map((e) => e.filename)
    }
    const all = await zipped()
    for (const file of both) assert(all.includes(file), file)

    const made = await clonedIn(await call('POST', '/api/sessions/s1/clone', {}))
    const copy = (await getSession(call, 'storyboard', made.id)).frames[0].pictures[0]
    assertEquals(copy, picture)
    const there = (await Array.fromAsync(Deno.readDir(`${root}/${made.id}`))).map((e) => e.name)
    for (const file of both) assert(there.includes(file), file)

    // Without the renders before the face pass: the faces alone.
    const leave = encodeURIComponent(JSON.stringify({ ...KEEP_ALL, beforeFaces: true }))
    const faces = await zipped(`?leave=${leave}`)
    assertEquals(both.map((f) => faces.includes(f)), [true, false, true, false])
  }))

Deno.test("Each Image Model's render of a Frame has its own face pass, as Compare shows them", () =>
  withTempDir(async (root) => {
    const { call } = await rendered(root, 3)
    const first = (await getSession(call, 'storyboard')).frames[0].pictures[0]
    await (await call('PUT', '/api/sessions/s1/image-model', { imageModel: 'krea-2' })).body
      ?.cancel()
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 0 })
    assertEquals(await settled(call), [])
    const [qwen, krea] = (await getSession(call, 'storyboard')).frames[0].pictures
    assertEquals(qwen, first)
    assertEquals([krea.imageModel, krea.faces?.subjects], ['krea-2', ['Ace']])
    assert(krea.faces!.other!.file !== first.faces!.other!.file)
  }))
