import { assert, assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import decodePng from '@jsquash/png/decode.js'
import { fakeImageGenerator, testPng, withTempDir } from '../testing.ts'
import { fakeHeadFinder } from '../heads/testing.ts'
import type { Head } from '../heads/heads.ts'
import type { SessionStore } from '../session.ts'
import type { Session, SheetPicture } from '../../shared/session.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import { headArea } from './area.ts'
import {
  type FacesDone,
  faceStrength,
  pickHead,
  type ShownSheet,
  shownSheets,
  twoPasses,
  viewFor,
} from './facePass.ts'

const made = (slug: string): SheetPicture => ({
  file: `sheet-${slug}-aaaaaaaa.png`,
  views: [1, 2, 3].map((i) => `sheet-${slug}-aaaaaaaa-view${i}.png`) as SheetPicture['views'],
  mirrored: [1, 2, 3].map((i) =>
    `sheet-${slug}-aaaaaaaa-view${i}-mirrored.png`
  ) as SheetPicture['mirrored'],
  imageModel: 'qwen-image-2.1',
  createdAt: '2026-11-26T00:00:00.000Z',
})
const kael: ShownSheet = {
  subject: 'Kael',
  identity: 'Kael, a 42-year-old man.',
  made: made('kael'),
}
const elara: ShownSheet = {
  subject: 'Elara Vance',
  identity: 'Elara Vance, a 20-year-old woman.',
  made: made('elara-vance'),
}
const head = (label: string, box: Head['box'], facing?: Head['facing']): Head => ({
  label,
  box,
  ...(facing && { facing }),
})
const KAEL_HEAD = head('Kael', [100, 100, 300, 300], 'three-quarter right')
const ELARA_HEAD = head('Elara Vance', [600, 100, 800, 300])

/** A face pass on a 26×38 render in `dir`, with these heads to find and count. */
async function pass(
  dir: string,
  script: Parameters<typeof fakeHeadFinder>[0],
  sheets: ShownSheet[],
  expression = 'Kael scowls at Elara; she cries.',
) {
  await Deno.writeFile(join(dir, 'frame-2-12345678.png'), await testPng(26, 38))
  const images = fakeImageGenerator({ pictures: true })
  const heads = fakeHeadFinder(script)
  const events: unknown[] = []
  const way = twoPasses({
    store: { dir: () => dir } as unknown as SessionStore,
    imageGenerator: images,
    heads,
    settings: () => Promise.resolve(DEFAULT_SETTINGS),
  })
  const done = await way.repaint(
    {
      session: { id: 's1' } as Session,
      index: 2,
      file: 'frame-2-12345678.png',
      seed: 40,
      sheets,
      expression,
    },
    (e) => events.push(e),
    new AbortController().signal,
  )
  return { done, images, heads, events }
}

const faced = (done: FacesDone) => {
  assert('faced' in done, `not faced: ${JSON.stringify(done)}`)
  return done.faced
}

Deno.test('An edit per face shown, each from the view of its sheet nearest its turn, the expression named', () =>
  withTempDir(async (dir) => {
    const { done, images, heads } = await pass(dir, { found: [[KAEL_HEAD], [ELARA_HEAD]] }, [
      kael,
      elara,
    ])
    const { file, pass: made, missed } = faced(done)
    // Each found by name and identity, on the render.
    assertEquals(heads.asked.map((a) => [a.image, a.who?.name]), [
      ['frame-2-12345678.png', 'Kael'],
      ['frame-2-12345678.png', 'Elara Vance'],
    ])
    // An edit each, the second made from the first; seeded one on from what each is made from.
    assertEquals(images.edits.map((e) => [e.references, e.seed, e.model]), [
      // Kael turned right: the three-quarter view, mirrored. Elara's turn not said: the three-quarter.
      [[kael.made.mirrored[1]], 41, DEFAULT_SETTINGS.faceEditModel],
      [[elara.made.views[1]], 42, DEFAULT_SETTINGS.faceEditModel],
    ])
    assertEquals(images.edits[0].image, 'frame-2-12345678.png')
    // Started part-way from the render, as measured for Qwen-Image 2.1 Edit; a model not measured from noise.
    assertEquals(images.edits.map((e) => e.strength), [0.96, 0.96])
    assertEquals(faceStrength('flux3-klein-edit'), 1)
    assertEquals(faceStrength(DEFAULT_SETTINGS.faceEditModel, true), 0.9)
    assertEquals(images.edits[1].image, `${images.edits[0].name}.png`)
    assertEquals(
      images.edits[0].instruction,
      "Give Kael, the one in the marked area of image 1, the face and hair of the one in image 2. Keep Kael's expression exactly as in image 1 (Kael scowls at Elara; she cries), the way the head is turned and tilted, and everything else.",
    )
    assertEquals([made.subjects, made.seed, missed], [['Kael', 'Elara Vance'], 42, []])
    // Only the render and the faces are left: the masks and the first edit are gone.
    const left = (await Array.fromAsync(Deno.readDir(dir))).map((e) => e.name).sort()
    assertEquals(left, [file, 'frame-2-12345678.png'].sort())
  }))

Deno.test('No head found: the render is left as it was, saying whose', () =>
  withTempDir(async (dir) => {
    const { done, images } = await pass(dir, { found: [[], []] }, [kael, elara])
    assertEquals(done, { skipped: 'No head found of Kael or Elara Vance: saved as rendered.' })
    assertEquals(images.edits, [])
  }))

Deno.test("One head found of two: that one is repainted, and the other's missed", () =>
  withTempDir(async (dir) => {
    const { done, images } = await pass(dir, { found: [[], [ELARA_HEAD]] }, [kael, elara], '')
    const { pass: made, missed } = faced(done)
    assertEquals([made.subjects, missed], [['Elara Vance'], ['Kael']])
    // Its expression not known: not named.
    assertEquals(
      images.edits[0].instruction,
      "Give Elara Vance, the one in the marked area of image 1, the face and hair of the one in image 2. Keep Elara Vance's expression exactly as in image 1, the way the head is turned and tilted, and everything else.",
    )
  }))

Deno.test('A cancelled face pass leaves only the render', () =>
  withTempDir(async (dir) => {
    await Deno.writeFile(join(dir, 'frame-0-12345678.png'), await testPng(26, 38))
    const controller = new AbortController()
    const images = fakeImageGenerator({ pictures: true })
    const edit = images.edit.bind(images)
    images.edit = async (req, signal) => {
      const file = await edit(req, signal)
      controller.abort()
      return file
    }
    const way = twoPasses({
      store: { dir: () => dir } as unknown as SessionStore,
      imageGenerator: images,
      heads: fakeHeadFinder({ found: [[KAEL_HEAD], [ELARA_HEAD]] }),
    })
    await assertRejects(() =>
      way.repaint(
        {
          session: { id: 's1' } as Session,
          index: 0,
          file: 'frame-0-12345678.png',
          seed: 1,
          sheets: [kael, elara],
          expression: '',
        },
        () => {},
        controller.signal,
      )
    )
    assertEquals((await Array.fromAsync(Deno.readDir(dir))).map((e) => e.name), [
      'frame-0-12345678.png',
    ])
  }))

Deno.test('A face pass uses the sheets of the Subjects shown, ticked and made, in their order', () => {
  const sheets = [
    { subject: 'Kael', ticked: true, identity: kael.identity, seed: 1, made: kael.made },
    { subject: 'Elara Vance', ticked: true, identity: elara.identity, seed: 2, made: elara.made },
    { subject: 'Mira', ticked: false, identity: 'Mira.', seed: 3, made: made('mira') },
    { subject: 'Doran', ticked: true, identity: 'Doran.', seed: 4 },
  ]
  assertEquals(
    shownSheets(sheets, ['Elara Vance', 'Mira', 'Doran', 'Kael']).map((s) => s.subject),
    ['Elara Vance', 'Kael'],
  )
})

Deno.test('A head is picked by its name, never one another Subject took', () => {
  const two = [head('a man', [0, 0, 100, 100]), head('Doran', [500, 0, 600, 100])]
  assertEquals(pickHead(two, 'Doran Vale', []), two[1])
  assertEquals(pickHead(two, 'Kael', []), two[0])
  assertEquals(pickHead(two, 'Kael', [two[0]]), two[1])
  assertEquals(pickHead([two[0]], 'Kael', [two[0]]), undefined)
})

Deno.test("A head's turn picks the sheet's view, mirrored for a face turned right", () => {
  const m = made('kael')
  assertEquals(viewFor(m, 'front'), m.views[0])
  assertEquals(viewFor(m, 'three-quarter left'), m.views[1])
  assertEquals(viewFor(m, 'profile left'), m.views[2])
  assertEquals(viewFor(m, 'three-quarter right'), m.mirrored[1])
  assertEquals(viewFor(m, 'profile right'), m.mirrored[2])
  assertEquals(viewFor(m, undefined), m.views[1])
})

Deno.test("A head's area is its box grown by a fifth, its edge softened", async () => {
  const png = await headArea([400, 400, 600, 600], { width: 1000, height: 1000 })
  const { data, width } = await decodePng(png.buffer)
  const at = (x: number, y: number) => data[(y * width + x) * 4]
  assertEquals(at(500, 500), 255)
  assertEquals(at(100, 100), 0)
  // Grown from 400 to 360: half-way up its softened edge there, nothing well outside it.
  assert(Math.abs(at(360, 500) - 128) < 12, `${at(360, 500)}`)
  assertEquals(at(280, 500), 0)
})
