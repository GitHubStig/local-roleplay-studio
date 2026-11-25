import { assertEquals } from '@std/assert'
import type { V4 } from './v4.ts'
import { v5 } from './v5.ts'

const settings = {
  textModel: 'gemma',
  thinking: false,
  imageModel: 'qwen',
  steps: 8,
  musicBehaviour: 'story',
  musicTaste: '',
} as const
const base = {
  id: 's1',
  title: 'A storm at sea.',
  brief: 'A storm at sea.',
  scenarioId: null,
  settings,
  seed: 1,
  createdAt: '2026-11-25T00:00:00.000Z',
}
const image = {
  body: 'She waits.',
  prompt: 'Mira. She waits. Ink.',
  written: { model: 'm', seconds: 1 },
}
const at = (index: number) => ({ index, pictures: [], createdAt: base.createdAt })

Deno.test('v5 gives no Session sheets, and keeps a Chain otherwise as it was', () => {
  const chain = { ...base, kind: 'chain', frames: [] } as V4
  assertEquals(v5(chain), { ...chain, settings: { ...settings, sheets: false } } as never)
})

Deno.test("v5 gives a Storyboard no sheets, and its written Frames' expression as not known", () => {
  const board = {
    ...base,
    kind: 'storyboard',
    frameCount: 2,
    look: null,
    frames: [{ ...at(0), beat: 'A', shown: [], image }, { ...at(1), beat: 'B', shown: [] }],
  } as V4
  const migrated = v5(board)
  if (migrated.kind !== 'storyboard') throw new Error('not a Storyboard')
  assertEquals(migrated.sheets, [])
  assertEquals(migrated.settings.sheets, false)
  assertEquals(migrated.frames[0].image?.expression, '')
  assertEquals(migrated.frames[1], board.frames[1] as never)
})

Deno.test("v5 gives a Roleplay no sheets, and its pictured Frames' expression as not known", () => {
  const reply = { internal: '', actions: 'She waits.', dialogue: '' }
  const roleplay = {
    ...base,
    kind: 'roleplay',
    cast: null,
    look: null,
    lookBehindCast: false,
    sheets: [],
    cues: [],
    frames: [
      {
        ...at(0),
        message: null,
        reply,
        written: image.written,
        image: { ...image, shown: [], clothing: '' },
      },
      { ...at(1), message: 'Hi.', reply, written: image.written },
    ],
  } as V4
  const migrated = v5(roleplay)
  if (migrated.kind !== 'roleplay') throw new Error('not a Roleplay')
  assertEquals([migrated.sheets, migrated.settings.sheets], [[], false])
  assertEquals(migrated.frames[0].image?.expression, '')
  assertEquals(migrated.frames[1], roleplay.frames[1] as never)
})
