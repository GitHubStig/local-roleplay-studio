import { assertEquals } from '@std/assert'
import type { V5 } from './v5.ts'
import { v6 } from './v6.ts'

const settings = {
  textModel: 'gemma',
  thinking: false,
  imageModel: 'qwen',
  steps: 8,
  musicBehaviour: 'story',
  musicTaste: '',
  sheets: true,
} as const
const base = {
  id: 's1',
  title: 'A storm at sea.',
  brief: 'A storm at sea.',
  scenarioId: null,
  settings,
  seed: 1,
  createdAt: '2026-11-26T00:00:00.000Z',
}
const image = {
  body: 'She waits.',
  expression: 'She frowns.',
  prompt: 'Mira. She waits. Ink.',
  written: { model: 'm', seconds: 1 },
}
const at = (index: number) => ({ index, pictures: [], createdAt: base.createdAt })
const made = {
  file: 'sheet-mira.png',
  views: ['v1.png', 'v2.png', 'v3.png'],
  mirrored: ['m1.png', 'm2.png', 'm3.png'],
  imageModel: 'qwen',
  createdAt: base.createdAt,
} as const
const sheets = [
  { subject: 'Mira', ticked: true, identity: 'A woman.', seed: 1, made },
  { subject: 'Sam', ticked: true, identity: 'A man.', seed: 2 },
]

Deno.test('v6 leaves a Chain as it was', () => {
  const chain = { ...base, kind: 'chain', frames: [] } as V5
  assertEquals(v6(chain), chain as never)
})

Deno.test("v6 takes a Storyboard's sheets for people's, and its Frames' clothing as not known", () => {
  const board = {
    ...base,
    kind: 'storyboard',
    frameCount: 2,
    look: null,
    sheets,
    frames: [{ ...at(0), beat: 'A', shown: [], image }, { ...at(1), beat: 'B', shown: [] }],
  } as V5
  const migrated = v6(board)
  if (migrated.kind !== 'storyboard') throw new Error('not a Storyboard')
  assertEquals(migrated.sheets[0].made?.thing, false)
  assertEquals(migrated.sheets[1], sheets[1] as never)
  assertEquals(migrated.frames[0].image?.clothing, '')
  assertEquals(migrated.frames[1], board.frames[1] as never)
})

Deno.test("v6 takes a Roleplay's sheets for people's, its Frames as they were", () => {
  const reply = { internal: '', actions: 'She waits.', dialogue: '' }
  const roleplay = {
    ...base,
    kind: 'roleplay',
    cast: null,
    look: null,
    lookBehindCast: false,
    sheets,
    cues: [],
    frames: [{
      ...at(0),
      message: null,
      reply,
      written: image.written,
      image: { ...image, shown: [], clothing: 'She wears a coat.' },
    }],
  } as V5
  const migrated = v6(roleplay)
  if (migrated.kind !== 'roleplay') throw new Error('not a Roleplay')
  assertEquals(migrated.sheets[0].made?.thing, false)
  assertEquals(migrated.frames, roleplay.frames as never)
})
