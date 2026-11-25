import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert'
import { headBackends, headFinder, parseHeads } from './heads.ts'

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

Deno.test('A head finder asks for a Subject by its identity, and for every head to count', async () => {
  const asked: string[] = []
  const finder = headFinder((_req, question) => {
    asked.push(question)
    return Promise.resolve(QUAY)
  })
  const who = { name: 'Kael', identity: 'Kael, a 42-year-old man with a scar.' }
  const req = { dir: '.', image: 'frame-0.png' }
  assertEquals((await finder.find({ ...req, who }, new AbortController().signal)).length, 2)
  assertStringIncludes(asked[0], 'Locate Kael, a 42-year-old man with a scar. in the picture')
  assertStringIncludes(asked[0], '"facing"')
  assertEquals((await finder.count(req, new AbortController().signal)).length, 2)
  assertStringIncludes(asked[1], 'the head of every person or creature')
})

Deno.test('Questions go to the Backend given, or where the face pass edits go', async () => {
  const went: string[] = []
  const ask = headBackends({
    mflux: () => (went.push('mflux'), Promise.resolve('[]')),
    comfyui: (address) => () => (went.push(`comfyui ${address}`), Promise.resolve('[]')),
    backendOf: () => Promise.resolve({ id: 'here', kind: 'here', address: '' }),
  })
  const req = { dir: '.', image: 'a.png' }
  const signal = new AbortController().signal
  await ask(req, 'q', signal)
  await ask(
    { ...req, backend: { id: 'pc', kind: 'comfyui', address: 'http://pc:8188' } },
    'q',
    signal,
  )
  assertEquals(went, ['mflux', 'comfyui http://pc:8188'])
  const nowhere = headBackends({
    comfyui: () => () => Promise.resolve('[]'),
    backendOf: () => Promise.resolve(undefined),
  })
  await assertRejects(() => nowhere(req, 'q', signal), Error, 'No Backend can find heads')
})
