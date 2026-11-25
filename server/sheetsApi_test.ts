import { assertEquals } from '@std/assert'
import { fakeImageGenerator, planOf, scriptedTextModel, withTempDir } from './testing.ts'
import { replyOf, scriptedRoleplayModel, testCast, testLook } from './roleplay/testing.ts'
import {
  getSession,
  listJobs,
  readEvents,
  refusalIn,
  sessionFrom,
  settled,
  setup,
} from './appTesting.ts'
import type { Availabilities } from '../shared/features.ts'
import { DEFAULT_SETTINGS } from './settings.ts'

const on = { available: true }
/** Everything available, sheets too. */
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

/** Settings' Features as they start, sheets on (`setup` has them off). */
const SHEETS_ON = { ...DEFAULT_SETTINGS.features, sheets: true }

/** The subjects of the sheet jobs listed, by status. */
const sheetJobs = async (call: ReturnType<typeof setup>['call']) =>
  (await listJobs(call)).filter((j) => j.kind === 'sheet').map((j) =>
    `${j.sheet?.subject} ${j.status}`
  )

Deno.test("A Roleplay's sheets are made from its Look in the Cast review, and settled at Begin", () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = setup({
      root,
      settings: { textModel: 'x', features: SHEETS_ON },
      features,
      imageGenerator: images,
      roleplayModel: scriptedRoleplayModel({
        casts: [testCast],
        replies: [replyOf('You are late.')],
        looks: [testLook('Ink.', 'Mira Vance, 34.', 'Sam Reyes, 25.')],
      }),
    })
    await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    // The Look, then a sheet of each of its Subjects.
    assertEquals(await settled(call), [])
    assertEquals(await sheetJobs(call), ['Mira Vance done', 'Sam Reyes done'])
    const looked = await getSession(call, 'roleplay')
    assertEquals(looked.sheets.map((s) => [s.subject, s.ticked, s.seed, !!s.made]), [
      ['Mira Vance', true, looked.seed, true],
      ['Sam Reyes', true, looked.seed + 1, true],
    ])
    await call('DELETE', '/api/sessions/s1/jobs/finished')

    // Mira's identity edited by hand: her sheet is made again from it; Sam's stays.
    const sam = looked.sheets[1].made
    await call(
      'PUT',
      '/api/sessions/s1/roleplay/look',
      testLook('Ink.', 'Mira Vance, 34, green eyes.', 'Sam Reyes, 25.'),
    )
    assertEquals(await settled(call), [])
    const edited = await getSession(call, 'roleplay')
    assertEquals(edited.sheets[0].identity, 'Mira Vance, 34, green eyes.')
    assertEquals(!!edited.sheets[0].made, true)
    assertEquals(edited.sheets[1].made, sam)
    await call('DELETE', '/api/sessions/s1/jobs/finished')

    // Sam unticked keeps his sheet, unmade; Mira's redone with the next seed.
    const unticked = await sessionFrom(
      await call('PUT', '/api/sessions/s1/sheets/Sam%20Reyes', { ticked: false }),
    )
    assertEquals(unticked.kind === 'roleplay' && unticked.sheets[1].ticked, false)
    await call('POST', '/api/sessions/s1/sheets/Mira%20Vance/redo')
    assertEquals(await settled(call), [])
    assertEquals(await sheetJobs(call), ['Mira Vance done'])
    assertEquals((await getSession(call, 'roleplay')).sheets[0].seed, looked.seed + 1)

    // Queued only from the Look and these routes.
    const queued = await call('POST', '/api/sessions/s1/jobs', { kind: 'sheet', frameIndex: 0 })
    assertEquals(queued.status, 400)

    // Begun: settled.
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin', { picture: false }))
    const redo = await call('POST', '/api/sessions/s1/sheets/Mira%20Vance/redo')
    assertEquals((await refusalIn(redo)).error, 'The sheets are settled once the story has begun')
  }))

Deno.test("A Storyboard's sheets are made as it's planned; a Session without sheets makes none", () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = setup({
      root,
      settings: { textModel: 'x', features: SHEETS_ON },
      features,
      imageGenerator: images,
      textModel: scriptedTextModel([], { plans: [planOf(2), planOf(2)] }),
    })
    await call('POST', '/api/sessions', {
      kind: 'storyboard',
      brief: 'A first dunk.',
      frameCount: 2,
    })
    await readEvents(await call('POST', '/api/sessions/s1/plan'))
    assertEquals(await settled(call), [])
    assertEquals(await sheetJobs(call), ['Ace done'])

    await call('POST', '/api/sessions', {
      kind: 'storyboard',
      brief: 'A first dunk.',
      frameCount: 2,
      sheets: false,
    })
    await readEvents(await call('POST', '/api/sessions/s2/plan'))
    assertEquals(await settled(call, 's2'), [])
    assertEquals((await listJobs(call, 's2')).length, 0)
    assertEquals(images.sizes.length, 1)
  }))
