import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import decodePng from '@jsquash/png/decode.js'
import { dirSessionStore } from '../session.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import { fakeImageGenerator, scriptedTextModel, testPng, withTempDir } from '../testing.ts'
import { replyOf, testCast, testLook } from '../roleplay/testing.ts'
import type { RoleplaySession } from '../../shared/roleplay.ts'
import type { Sheet } from '../../shared/session.ts'
import type { SheetEvent } from '../../shared/events.ts'
import {
  changeSheet,
  cutSheet,
  makeSheet,
  reconcileSheets,
  redoSheet,
  SHEET_SIZE,
  SheetError,
  sheetsSettled,
  sheetsToMake,
  tickSheet,
} from './sheets.ts'
import { sheetFiles } from '../sessionParts.ts'

const signal = () => new AbortController().signal

/** A Roleplay in its Cast review, with sheets on and its Look written. */
const reviewing = (extra: Partial<RoleplaySession> = {}): RoleplaySession => ({
  id: 'r1',
  kind: 'roleplay',
  title: 'A test roleplay',
  brief: 'A storm at sea.',
  scenarioId: null,
  settings: { ...DEFAULT_SETTINGS, sheets: true },
  seed: 100,
  createdAt: '2026-11-25T00:00:00.000Z',
  cast: testCast,
  look: testLook('Ink.', 'Mira Vance, 34, a grey braid.', 'Sam Reyes, 25.'),
  lookBehindCast: false,
  sheets: [],
  cues: [],
  frames: [],
  ...extra,
})

const made = (file: string) => ({
  file,
  views: [`${file}-1`, `${file}-2`, `${file}-3`] as [string, string, string],
  mirrored: [`${file}-1m`, `${file}-2m`, `${file}-3m`] as [string, string, string],
  imageModel: 'qwen-image-2.1',
  createdAt: '2026-11-25T00:00:00.000Z',
})

Deno.test('reconcileSheets gives each Subject a ticked sheet, seeded from the Session and its place', () => {
  const { sheets, remade, dropped } = reconcileSheets(reviewing())
  assertEquals(sheets, [
    { subject: 'Mira Vance', ticked: true, identity: 'Mira Vance, 34, a grey braid.', seed: 100 },
    { subject: 'Sam Reyes', ticked: true, identity: 'Sam Reyes, 25.', seed: 101 },
  ])
  assertEquals([remade, dropped], [[], []])
  // None for a Session without sheets.
  const off = reviewing({ settings: { ...DEFAULT_SETTINGS, sheets: false } })
  assertEquals(reconcileSheets(off).sheets, [])
})

Deno.test('reconcileSheets keeps a sheet, renames one, makes one again from a new identity, drops one gone', () => {
  const mira: Sheet = {
    subject: 'Mira Vance',
    ticked: false,
    identity: 'Mira Vance, 34, a grey braid.',
    seed: 100,
    made: made('mira.png'),
  }
  const sam: Sheet = {
    subject: 'Sam Reyes',
    ticked: true,
    identity: 'Sam Reyes, 25.',
    seed: 101,
    made: made('sam.png'),
  }
  // Sam renamed, in his place: his sheet follows him, as it was.
  const renamed = reconcileSheets(reviewing({
    sheets: [mira, sam],
    look: {
      ...testLook(),
      subjects: [{ name: 'Mira Vance', identity: mira.identity }, {
        name: 'Sam',
        identity: sam.identity,
      }],
    },
  }))
  assertEquals(renamed.sheets, [mira, { ...sam, subject: 'Sam' }])
  // Mira's identity changed: made again, unticked as she was; Sam gone, his picture with him.
  const changed = reconcileSheets(reviewing({
    sheets: [mira, sam],
    look: {
      ...testLook(),
      subjects: [{ name: 'Mira Vance', identity: 'Mira Vance, 34, green eyes.' }],
    },
  }))
  assertEquals(changed.sheets, [
    { subject: 'Mira Vance', ticked: false, identity: 'Mira Vance, 34, green eyes.', seed: 100 },
  ])
  assertEquals(changed.remade, ['Mira Vance'])
  assertEquals(changed.dropped.map((d) => d.file), ['mira.png', 'sam.png'])
  assertEquals(sheetsToMake(reviewing({ sheets: changed.sheets })), [])
})

Deno.test('cutSheet cuts the three views apart, left to right, and mirrors each', () =>
  withTempDir(async (dir) => {
    await Deno.writeFile(join(dir, 'sheet.png'), await testPng(48, 20))
    const { views, mirrored } = await cutSheet(dir, 'sheet.png')
    assertEquals(views, ['sheet-view1.png', 'sheet-view2.png', 'sheet-view3.png'])
    const reds = async (file: string) => {
      const bytes = await Deno.readFile(join(dir, file))
      const png = await decodePng(bytes.buffer)
      return Array.from({ length: png.width }, (_, x) => png.data[x * 4])
    }
    assertEquals(await reds(views[1]), Array.from({ length: 16 }, (_, x) => 16 + x))
    assertEquals(await reds(mirrored[2]), Array.from({ length: 16 }, (_, x) => 47 - x))
    await assertRejects(() => cutSheet(dir, 'card.svg'), Error, 'not a PNG')
  }))

Deno.test('makeSheet renders a Subject at its seed and the sheet size, from its identity, and keeps its views', () =>
  withTempDir(async (root) => {
    const store = dirSessionStore(root)
    const fresh = reviewing()
    const session = { ...fresh, sheets: reconcileSheets(fresh).sheets }
    await store.save(session)
    const images = fakeImageGenerator()
    const events: SheetEvent[] = []
    const updated = await makeSheet(
      { store, imageGenerator: images },
      (await store.load('r1')) as RoleplaySession,
      'Sam Reyes',
      (e) => events.push(e),
      signal(),
    )
    const sheet = updated.sheets[1]
    assertEquals([sheet.made?.views.length, sheet.made?.mirrored.length], [3, 3])
    assertEquals(images.sizes, [SHEET_SIZE])
    assertStringIncludes(images.prompts[0], 'Sam Reyes, 25. A turnaround sheet of Sam Reyes')
    assertStringIncludes(images.prompts[0], ' Ink.')
    assertEquals(events.at(-1), { type: 'sheet', subject: 'Sam Reyes', sheet })
    for (const file of sheetFiles(sheet.made)) {
      assertEquals((await Deno.stat(join(store.dir('r1'), file))).isFile, true)
    }
  }))

Deno.test('makeSheet discards a sheet whose identity changed while it rendered', () =>
  withTempDir(async (root) => {
    const store = dirSessionStore(root)
    const fresh = reviewing()
    const session = { ...fresh, sheets: reconcileSheets(fresh).sheets }
    await store.save(session)
    const images = fakeImageGenerator()
    const changing = {
      ...images,
      async generate(...args: Parameters<typeof images.generate>) {
        const now = (await store.load('r1')) as RoleplaySession
        await store.save({
          ...now,
          sheets: now.sheets.map((s, i) => i ? s : { ...s, identity: 'Mira, green eyes.' }),
        })
        return await images.generate(...args)
      },
    }
    await assertRejects(
      () =>
        makeSheet({ store, imageGenerator: changing }, session, 'Mira Vance', () => {}, signal()),
      Error,
      'changed while it was made',
    )
    const after = (await store.load('r1')) as RoleplaySession
    assertEquals(after.sheets[0].made, undefined)
    assertEquals(
      [...Deno.readDirSync(store.dir('r1'))].filter((f) => f.name.startsWith('sheet-')),
      [],
    )
  }))

Deno.test('Redo and the tick change a sheet until the story begins, then are refused', () =>
  withTempDir(async (root) => {
    const store = dirSessionStore(root)
    const fresh = reviewing()
    const session = { ...fresh, sheets: reconcileSheets(fresh).sheets }
    await store.save(session)
    const images = fakeImageGenerator()
    const first = await makeSheet(
      { store, imageGenerator: images },
      session,
      'Mira Vance',
      () => {},
      signal(),
    )
    const old = first.sheets[0].made!
    const redone = await redoSheet(store, first, 'Mira Vance')
    assertEquals([redone.sheets[0].seed, redone.sheets[0].made], [101, undefined])
    await assertRejects(() => Deno.stat(join(store.dir('r1'), old.file)))
    const unticked = await tickSheet(store, redone, 'Sam Reyes', false)
    assertEquals(sheetsToMake(unticked).map((s) => s.subject), ['Mira Vance'])
    await assertRejects(() => tickSheet(store, unticked, 'Nobody', true), SheetError, 'no sheet')

    const begun: RoleplaySession = {
      ...(unticked as RoleplaySession),
      frames: [{
        index: 0,
        message: null,
        reply: replyOf('Hi.'),
        written: { model: 'm', seconds: 1 },
        pictures: [],
        createdAt: '',
      }],
    }
    await store.save(begun)
    assertEquals(sheetsSettled(begun), true)
    await assertRejects(() => redoSheet(store, begun, 'Mira Vance'), SheetError, 'settled')
    await assertRejects(() => tickSheet(store, begun, 'Sam Reyes', true), SheetError, 'settled')
  }))

Deno.test("Change… rewrites a Subject's identity with the note, unsaved, refusing what crosses a Limit", () =>
  withTempDir(async (root) => {
    const store = dirSessionStore(root)
    const fresh = reviewing()
    const session = { ...fresh, sheets: reconcileSheets(fresh).sheets }
    await store.save(session)
    const textModel = scriptedTextModel([], {
      changes: ['Mira Vance, 34, a grey braid, green eyes.', 'Mira Vance, nude.'],
    })
    const events: SheetEvent[] = []
    const identity = await changeSheet(
      { textModel },
      session,
      'Mira Vance',
      ' green eyes ',
      (e) => events.push(e),
      signal(),
    )
    assertEquals(identity, 'Mira Vance, 34, a grey braid, green eyes.')
    assertEquals(events.at(-1), { type: 'identity', subject: 'Mira Vance', identity })
    // Not saved: the player reads it first.
    assertEquals(await store.load('r1'), session)
    // The model is told the identity as it is, and the note.
    const asked = textModel.changeRequests[0][1].content
    assertStringIncludes(asked, 'Mira Vance, 34, a grey braid.')
    assertStringIncludes(asked, 'green eyes')
    const change = (note: string) =>
      changeSheet({ textModel }, session, 'Mira Vance', note, () => {}, signal())
    await assertRejects(() => change('  '), SheetError, 'Say what to change')
    await assertRejects(() => change('make her nude'), SheetError, 'Declined')
    await assertRejects(() => change('older'), SheetError, 'crosses a limit')
    assertEquals(textModel.changeRequests.length, 2)
  }))
