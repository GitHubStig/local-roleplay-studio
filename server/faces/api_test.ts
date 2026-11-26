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
  heads = fakeHeadFinder({ found: [[ACE], [ACE]] }),
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
    assert(picture.file !== faces.other.file)
    // The face edit: on the render, by the face pass's model, with the view of Ace's sheet nearest
    // the head's turn (the three-quarter, as none was said), and the expression.
    const edit = images.edits[0]
    assertEquals([edit.image, edit.references, edit.seed], [
      faces.other.file,
      [ace.made!.views[1]],
      session.seed + 1,
    ])
    assert(edit.instruction.includes('(Calm)'), edit.instruction)
    // Both served.
    for (const file of [picture.file, faces.other.file]) {
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
    assertEquals([used.file, used.faces?.without, used.faces?.other.file], [
      faces.other.file,
      true,
      picture.file,
    ])
    const back = await sessionFrom(
      await call('PUT', '/api/sessions/s1/pictures/0/faces', { without: false }),
    )
    assertEquals(back.frames[0].pictures[0].file, picture.file)
    const none = await call('PUT', '/api/sessions/s1/pictures/1/faces', { without: true })
    assertEquals((await refusalIn(none)).error, "Frame 2's picture had no face pass")

    // An edit made from the faces is seeded one on from the pass.
    await call('POST', '/api/sessions/s1/jobs', {
      kind: 'edit',
      frameIndex: 0,
      edit: { instruction: 'A red cap.' },
    })
    assertEquals(await settled(call), [])
    assertEquals(images.edits.at(-1)!.seed, faces.seed + 1)

    // Rendered again: the face pass again, the old faces and render gone.
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 0 })
    assertEquals(await settled(call), [])
    const again = (await getSession(call, 'storyboard')).frames[0].pictures[0]
    assert(again.faces && again.faces.other.file !== faces.other.file)
    const left = (await Array.fromAsync(Deno.readDir(`${root}/s1`))).map((e) => e.name)
    assertEquals([left.includes(picture.file), left.includes(faces.other.file)], [false, false])
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
