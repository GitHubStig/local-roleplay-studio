import { assertEquals, assertThrows } from '@std/assert'
import type { V1 } from './v1.ts'
import { v2 } from './v2.ts'

const base = {
  id: 's1',
  brief: 'A storm.',
  scenarioId: null,
  settings: {
    textModel: 'gemma',
    thinking: false,
    imageModel: 'qwen',
    steps: 8,
    musicBehaviour: 'story' as const,
    musicTaste: '',
  },
  seed: 1,
  createdAt: '2026-11-20T00:00:00.000Z',
}
const picture = {
  image: 'frame-0-aaaaaaaa.png',
  imageModel: 'qwen',
  edits: [{ image: 'edit-0-bbbbbbbb.png', instructions: ['A hat'], editModel: 'e', seed: 2 }],
  picked: 1,
}
const look = { subjects: [{ name: 'Mira', identity: 'Mira, 34.' }], style: 'Ink.' }

Deno.test("v2 moves a Chain Frame's Image Prompt into its image, and who wrote it into written", () => {
  const chain: V1 = {
    ...base,
    kind: 'chain',
    frames: [{
      index: 0,
      prompt: 'Mira waits.',
      pictures: [picture],
      createdAt: base.createdAt,
      timings: { text: 2.5 },
      textModel: 'gemma',
      action: null,
      narration: 'Mira waits.',
      outcome: 'done',
      thinking: 'She waits.',
    }],
  }
  assertEquals(v2(chain).frames, [{
    index: 0,
    image: { prompt: 'Mira waits.' },
    pictures: [{
      file: 'frame-0-aaaaaaaa.png',
      imageModel: 'qwen',
      edits: [{ file: 'edit-0-bbbbbbbb.png', instructions: ['A hat'], editModel: 'e', seed: 2 }],
      picked: 1,
    }],
    createdAt: base.createdAt,
    written: { model: 'gemma', seconds: 2.5, thinking: 'She waits.' },
    action: null,
    narration: 'Mira waits.',
    outcome: 'done',
  }])
})

Deno.test('v2 gives a written Storyboard Frame an image, and a planned one none', () => {
  const frame = { index: 0, beat: 'She waits.', shown: ['Mira'], pictures: [], createdAt: '' }
  const storyboard: V1 = {
    ...base,
    kind: 'storyboard',
    frameCount: 2,
    look,
    frames: [
      {
        ...frame,
        body: 'She waits.',
        prompt: 'Mira, 34. She waits. Ink.',
        blocked: 'no nudity',
        timings: { text: 3 },
        textModel: 'gemma',
      },
      { ...frame, index: 1, body: '', prompt: '' },
    ],
  }
  assertEquals(v2(storyboard).frames, [
    {
      ...frame,
      image: {
        body: 'She waits.',
        prompt: 'Mira, 34. She waits. Ink.',
        blocked: 'no nudity',
        written: { model: 'gemma', seconds: 3 },
      },
    },
    { ...frame, index: 1 },
  ])
})

Deno.test('v2 refuses a written Storyboard Frame that says no model wrote it', () => {
  const storyboard: V1 = {
    ...base,
    kind: 'storyboard',
    frameCount: 1,
    look,
    frames: [{
      index: 0,
      beat: 'She waits.',
      shown: [],
      body: 'She waits.',
      prompt: 'She waits. Ink.',
      pictures: [],
      createdAt: '',
    }],
  }
  assertThrows(() => v2(storyboard), Error, "Frame 1's sentences don't say which model wrote them")
})

Deno.test("v2 gathers a Roleplay's records and a pictured Frame's image", () => {
  const exchange = {
    index: 0,
    message: null,
    reply: { internal: '', actions: 'She waits.', dialogue: '' },
    timings: { text: 1.5 },
    textModel: 'gemma',
    pictures: [],
    createdAt: '',
  }
  const roleplay: V1 = {
    ...base,
    kind: 'roleplay',
    cast: null,
    look,
    lookTimings: { text: 4 },
    lookModel: 'gemma',
    scoreTimings: { text: 5 },
    scoreModel: 'gemma',
    scoreThinking: 'Folk.',
    cues: [],
    hindsight: { model: 'gemma', chunks: 2, courses: ['a', 'b'], timings: { text: 30 } },
    frames: [
      {
        ...exchange,
        body: 'She waits.',
        prompt: 'Mira, 34. She waits. Ink.',
        shown: ['Mira'],
        clothing: 'Mira wears a coat.',
        pictureTimings: { text: 6 },
        pictureModel: 'artist',
        music: {
          cue: 'c1',
          reading: 'Calm.',
          decision: 'continue',
          entry: 'gentle',
          line: '',
          model: 'gemma',
          timings: { text: 0.5 },
        },
      },
      { ...exchange, index: 1, message: 'Hello.' },
    ],
  }
  const after = v2(roleplay)
  if (after.kind !== 'roleplay') throw new Error('Not a Roleplay')
  assertEquals(after.lookWritten, { model: 'gemma', seconds: 4 })
  assertEquals(after.scoreWritten, { model: 'gemma', seconds: 5, thinking: 'Folk.' })
  assertEquals(after.hindsight, {
    chunks: 2,
    courses: ['a', 'b'],
    written: { model: 'gemma', seconds: 30 },
  })
  const [pictured, plain] = after.frames
  assertEquals(pictured.written, { model: 'gemma', seconds: 1.5 })
  assertEquals(pictured.image, {
    body: 'She waits.',
    prompt: 'Mira, 34. She waits. Ink.',
    shown: ['Mira'],
    clothing: 'Mira wears a coat.',
    written: { model: 'artist', seconds: 6 },
  })
  assertEquals(pictured.music?.written, { model: 'gemma', seconds: 0.5 })
  assertEquals(plain.image, undefined)
  assertEquals(Object.keys(after).filter((k) => /Timings|Model|Thinking/.test(k)), [])
})
