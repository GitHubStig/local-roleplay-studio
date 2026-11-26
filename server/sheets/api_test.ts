import { assertEquals } from '@std/assert'
import { fakeImageGenerator, planOf, scriptedTextModel, withTempDir } from '../testing.ts'
import { replyOf, scriptedRoleplayModel, testCast, testLook } from '../roleplay/testing.ts'
import {
  clonedIn,
  getContents,
  getSession,
  importedIn,
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
      textModel: scriptedTextModel([], { changes: ['Mira Vance, 34, green eyes, short hair.'] }),
      roleplayModel: scriptedRoleplayModel({
        casts: [testCast],
        replies: [replyOf('You are late.')],
        looks: [testLook('Ink.', '34.', '25.')],
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
      testLook('Ink.', '34, green eyes.', '25.'),
    )
    assertEquals(await settled(call), [])
    const edited = await getSession(call, 'roleplay')
    assertEquals(edited.sheets[0].identity, '34, green eyes.')
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

    // Change…: the identity rewritten and answered, not saved; saved in the Look, the sheet is
    // made again from it, at the same seed.
    const change = await readEvents(
      await call('POST', '/api/sessions/s1/sheets/Mira%20Vance/change', { note: 'short hair' }),
    )
    const answered = change.find(([type]) => type === 'identity')?.[1]
    assertEquals(answered?.identity, '34, green eyes, short hair.')
    const unsaved = await getSession(call, 'roleplay')
    assertEquals(unsaved.look?.subjects[0].identity, '34, green eyes.')
    await call(
      'PUT',
      '/api/sessions/s1/roleplay/look',
      testLook('Ink.', '34, green eyes, short hair.', '25.'),
    )
    assertEquals(await settled(call), [])
    const changed = await getSession(call, 'roleplay')
    assertEquals([changed.sheets[0].identity, !!changed.sheets[0].made], [
      '34, green eyes, short hair.',
      true,
    ])
    assertEquals(changed.sheets[0].seed, unsaved.sheets[0].seed)

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
    const { call, handler } = setup({
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

    // A part of the Session: served, counted, sized, and carried by Clone.
    const { made } = (await getSession(call, 'storyboard')).sheets[0]
    for (const file of [made!.file, made!.views[1], made!.mirrored[2]]) {
      const served = await call('GET', `/api/sessions/s1/images/${file}`)
      await served.body?.cancel()
      assertEquals(served.status, 200, file)
    }
    const contents = await getContents(call)
    assertEquals(contents.counts.sheets, 1)
    assertEquals(contents.parts.sheets > 0, true)
    await call('DELETE', '/api/sessions/s1/jobs/finished')
    const clone = await clonedIn(await call('POST', '/api/sessions/s1/clone', {}))
    assertEquals((await getContents(call, clone.id)).parts.sheets, contents.parts.sheets)
    const cloned = await getSession(call, 'storyboard', clone.id)
    assertEquals(cloned.sheets[0].made, made)
    // And by an export, imported.
    const zip = await (await call('GET', '/api/sessions/s1/export')).arrayBuffer()
    const imported = await importedIn(
      await handler(
        new Request('http://localhost/api/sessions/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/zip' },
          body: zip,
        }),
      ),
    )
    assertEquals((await getContents(call, imported.id)).parts.sheets, contents.parts.sheets)
    assertEquals((await getSession(call, 'storyboard', imported.id)).sheets[0].made, made)

    const { id } = await sessionFrom(
      await call('POST', '/api/sessions', {
        kind: 'storyboard',
        brief: 'A first dunk.',
        frameCount: 2,
        sheets: false,
      }),
    )
    await readEvents(await call('POST', `/api/sessions/${id}/plan`))
    assertEquals(await settled(call, id), [])
    assertEquals((await listJobs(call, id)).length, 0)
    assertEquals(images.sizes.length, 1)
  }))

Deno.test('Sheets are turned on or off until the story begins, and again after a Restart', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x', features: SHEETS_ON },
      features,
      imageGenerator: fakeImageGenerator(),
      roleplayModel: scriptedRoleplayModel({
        casts: [testCast],
        replies: [replyOf('You are late.')],
        looks: [testLook('Ink.', '34.', '25.')],
      }),
    })
    await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm.', sheets: false })
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    assertEquals(await settled(call), [])
    assertEquals(await sheetJobs(call), [])

    // Turned on in the Cast review: its Look's sheets are made.
    const turned = await sessionFrom(await call('PUT', '/api/sessions/s1/sheets', { on: true }))
    assertEquals(turned.settings.sheets, true)
    assertEquals(await settled(call), [])
    assertEquals(await sheetJobs(call), ['Mira Vance done', 'Sam Reyes done'])
    const made = (await getSession(call, 'roleplay')).sheets.map((s) => s.made)

    // Off: the sheets made are kept, so on again makes nothing more.
    await call('DELETE', '/api/sessions/s1/jobs/finished')
    const off = await sessionFrom(await call('PUT', '/api/sessions/s1/sheets', { on: false }))
    assertEquals(off.settings.sheets, false)
    await call('PUT', '/api/sessions/s1/sheets', { on: true })
    assertEquals(await settled(call), [])
    assertEquals(await sheetJobs(call), [])
    assertEquals((await getSession(call, 'roleplay')).sheets.map((s) => s.made), made)

    // Begun: settled. Restarted: back in the Cast review, they can be turned off again.
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin', { picture: false }))
    const refused = await call('PUT', '/api/sessions/s1/sheets', { on: false })
    assertEquals(
      (await refusalIn(refused)).error,
      'The sheets are settled once the story has begun',
    )
    await call('POST', '/api/sessions/s1/restart')
    const restarted = await sessionFrom(
      await call('PUT', '/api/sessions/s1/sheets', { on: false }),
    )
    assertEquals(restarted.settings.sheets, false)

    // A Chain has none; and the switch takes only true or false.
    await call('POST', '/api/sessions', { kind: 'chain', brief: 'A storm.' })
    const chain = await call('PUT', '/api/sessions/s2/sheets', { on: true })
    assertEquals((await refusalIn(chain)).error, 'A Chain has no sheets')
    assertEquals((await call('PUT', '/api/sessions/s1/sheets', { on: 'yes' })).status, 400)
  }))

Deno.test("A Roleplay begun before its Look is written still gets that Look's sheets", () =>
  withTempDir(async (root) => {
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    const model = scriptedRoleplayModel({
      casts: [testCast],
      replies: [replyOf('You are late.')],
      looks: [testLook('Ink.', '34.', '25.')],
    })
    const holding = {
      ...model,
      async writeLook(...args: Parameters<typeof model.writeLook>) {
        await held
        return await model.writeLook(...args)
      },
    }
    const { call } = setup({
      root,
      settings: { textModel: 'x', features: SHEETS_ON },
      features,
      imageGenerator: fakeImageGenerator(),
      roleplayModel: holding,
    })
    await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin', { picture: false }))
    release()
    assertEquals(await settled(call), [])
    assertEquals(await sheetJobs(call), ['Mira Vance done', 'Sam Reyes done'])
  }))
