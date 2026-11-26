import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert'
import { headBackends, headFinder, parseHeads, sheetFlaw, type SheetLook } from './heads.ts'
import { FIT_SHEET } from './testing.ts'

// mflux's answer about the bench's quay, as it wrote it (2026-11-25).
const QUAY = '```json\n[\n    {"label": "man", "bbox_2d": [101, 53, 220, 333]},\n' +
  '    {"label": "woman", "bbox_2d": [278, 210, 385, 475]}\n]\n```'

Deno.test('parseHeads reads every head, fenced or not, with its box and turn', () => {
  assertEquals(parseHeads(QUAY), [
    { label: 'man', box: [101, 53, 220, 333] },
    { label: 'woman', box: [278, 210, 385, 475] },
  ])
  assertEquals(
    parseHeads('[{"label": "Kael", "bbox_2d": [0, 19, 333, 997], "facing": "three-quarter left"}]'),
    [{ label: 'Kael', box: [0, 19, 333, 997], facing: 'three-quarter left' }],
  )
  assertEquals(parseHeads('[]'), [])
  assertEquals(parseHeads('There is no one in the picture.'), [])
})

Deno.test('parseHeads keeps the heads before a cut, and tidies boxes', () => {
  // Cut off at the token cap, as the bench's collage of 16 heads was after 5.
  const cut = '[{"label": "a", "bbox_2d": [1, 2, 30, 40]}, {"label": "b", "bbox_2d": [5'
  assertEquals(parseHeads(cut), [{ label: 'a', box: [1, 2, 30, 40] }])
  // Corners the wrong way round are put right, and kept within the picture; one without area,
  // without a box, or with an unknown turn is read as far as it can be.
  assertEquals(
    parseHeads(
      '[{"label": "x", "bbox_2d": [900, 800, 100, -5]}, {"label": "flat", "bbox_2d": [5, 5, 5, 9]},' +
        ' {"label": "none"}, {"bbox_2d": [0, 0, 10, 10], "facing": "away"}]',
    ),
    [{ label: 'x', box: [100, 0, 900, 800] }, { label: '', box: [0, 0, 10, 10] }],
  )
})

Deno.test('A head finder asks for a Subject by its identity', async () => {
  const asked: string[][] = []
  const finder = headFinder((_req, questions) => {
    asked.push(questions)
    return Promise.resolve([QUAY])
  })
  const who = { name: 'Kael', identity: 'Kael, a 42-year-old man with a scar.' }
  const req = { dir: '.', image: 'frame-0.png' }
  assertEquals((await finder.find({ ...req, who }, new AbortController().signal)).length, 2)
  assertEquals(asked[0].length, 1)
  assertStringIncludes(asked[0][0], 'Locate Kael, a 42-year-old man with a scar. in the picture')
  assertStringIncludes(asked[0][0], '"facing"')
})

Deno.test('A sheet is looked over in one ask: its views, its heads, what is written', async () => {
  const asked: string[][] = []
  const finder = headFinder((_req, questions) => {
    asked.push(questions)
    return Promise.resolve([
      // Out of order, as a reply may be: read left to right.
      '[{"bbox_2d": [670, 0, 990, 1000], "facing": "profile right"},' +
      ' {"bbox_2d": [10, 0, 320, 1000], "facing": "front"},' +
      ' {"bbox_2d": [340, 0, 660, 1000], "facing": "three-quarter left"}]',
      QUAY,
      '```json\n{"backdrop": "plain, grey", "writing": "Kael,", "others": "a lit oil lamp"}\n```',
    ])
  })
  const who = { name: 'Kael', identity: 'Kael, a 42-year-old man with a scar.' }
  const look = await finder.lookOver(
    { dir: '.', image: 'sheet.png', who },
    new AbortController().signal,
  )
  assertEquals(asked.length, 1)
  assertStringIncludes(asked[0][0], 'show Kael, a 42-year-old man with a scar. several times')
  assertStringIncludes(asked[0][1], 'the head of every person or creature')
  assertStringIncludes(asked[0][2], 'turnaround sheet of Kael, a 42-year-old man')
  assertEquals(look.views.map((v) => v.facing), ['front', 'three-quarter left', 'profile right'])
  assertEquals([look.heads, look.writing, look.others], [2, 'Kael,', 'a lit oil lamp'])
  // A reply that isn't the object asked for says nothing is written.
  const plain = headFinder(() => Promise.resolve(['[]', '[]', 'A lantern.']))
  assertEquals(
    (await plain.lookOver({ dir: '.', image: 'a.png', who }, new AbortController().signal)).writing,
    '',
  )
})

Deno.test('A sheet is fit with three views in order and nothing written', () => {
  assertEquals(sheetFlaw(FIT_SHEET, 'Kael'), undefined)
  const view = (facing?: SheetLook['views'][number]['facing']) => ({
    label: '',
    box: [0, 0, 10, 10] as [number, number, number, number],
    ...(facing && { facing }),
  })
  // Either side for a turn, as Qwen3-VL calls a profile facing left "right".
  const mirrored = [view('front'), view('three-quarter right'), view('profile right')]
  assertEquals(sheetFlaw({ ...FIT_SHEET, views: mirrored }, 'Kael'), undefined)
  // Out of order, as the bench's Anima Turbo drew one.
  const order = [view('three-quarter left'), view('front'), view('three-quarter right')]
  assertStringIncludes(
    sheetFlaw({ ...FIT_SHEET, views: order }, 'Kael')!,
    'in that order (it read three-quarter, front, three-quarter)',
  )
  // A thing's turns aren't read, only that it's there three times.
  const thing = { ...FIT_SHEET, heads: 0, views: [view('front'), view('front'), view()] }
  assertEquals(sheetFlaw(thing, 'the Lantern of Vael'), undefined)
  assertEquals(
    sheetFlaw({ ...thing, views: [...thing.views, view()] }, 'the Lantern of Vael'),
    'It shows the Lantern of Vael 4 times, not three times.',
  )
  assertEquals(
    sheetFlaw({ ...thing, views: [] }, 'the Lantern of Vael'),
    "The Lantern of Vael isn't found in it.",
  )
  assertEquals(
    sheetFlaw({ ...FIT_SHEET, writing: 'Kael,' }, 'Kael'),
    'It has writing on it: “Kael,”.',
  )
})

Deno.test('Questions go to the Backend given, or where the face pass edits go', async () => {
  const went: string[] = []
  const ask = headBackends({
    mflux: () => (went.push('mflux'), Promise.resolve(['[]'])),
    comfyui: (address) => () => (went.push(`comfyui ${address}`), Promise.resolve(['[]'])),
    backendOf: () => Promise.resolve({ id: 'here', kind: 'here', address: '' }),
  })
  const req = { dir: '.', image: 'a.png' }
  const signal = new AbortController().signal
  await ask(req, ['q'], signal)
  await ask(
    { ...req, backend: { id: 'pc', kind: 'comfyui', address: 'http://pc:8188' } },
    ['q'],
    signal,
  )
  assertEquals(went, ['mflux', 'comfyui http://pc:8188'])
  const nowhere = headBackends({
    comfyui: () => () => Promise.resolve(['[]']),
    backendOf: () => Promise.resolve(undefined),
  })
  await assertRejects(() => nowhere(req, ['q'], signal), Error, 'No Backend can find heads')
})
