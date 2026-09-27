import { assertEquals, assertStringIncludes } from '@std/assert'
import { setLimitsEnabled } from '../limits.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import { artFrameMessages, pictured, storyText, wholeSentences } from './art.ts'
import { replyOf, testCast } from './testing.ts'
import type { RoleplaySession } from './types.ts'

const look = { subject: 'Mira Vance, a tall woman of 34.', style: 'An oil painting.' }

const session: RoleplaySession = {
  id: 'r1',
  kind: 'roleplay',
  brief: 'A storm at sea.',
  scenarioId: null,
  settings: DEFAULT_SETTINGS,
  seed: 1,
  createdAt: '2026-09-27T00:00:00.000Z',
  cast: testCast,
  look,
  frames: [
    {
      index: 0,
      message: null,
      reply: replyOf('You are late.', { internal: 'He looks lost.' }),
      image: null,
      createdAt: '2026-09-27T00:00:00.000Z',
    },
    {
      index: 1,
      message: 'I grab the rail.',
      reply: replyOf('', { actions: 'Mira steadies him.' }),
      image: null,
      createdAt: '2026-09-27T00:00:00.000Z',
    },
  ],
}

Deno.test('storyText has both sides of each exchange, but no thoughts, up to the Frame', () => {
  assertEquals(
    storyText(session, 1),
    'Frame 0\nMira Vance: Mira grips the wheel. "You are late."\n\n' +
      'Frame 1\nSam Reyes: I grab the rail.\nMira Vance: Mira steadies him.',
  )
  assertEquals(storyText(session, 0).includes('Frame 1'), false)
})

Deno.test('Undressed people are covered in pictures only while the Limits are on', async () => {
  const system = async () => (await artFrameMessages(session, 1))[0].content
  assertStringIncludes(await system(), 'nobody is shown undressed')
  setLimitsEnabled(false)
  try {
    const off = await system()
    assertEquals(off.includes('undressed'), false)
    assertStringIncludes(off, 'Everyone shown is an adult')
  } finally {
    setLimitsEnabled(true)
  }
})

Deno.test('pictured composes the Image Prompt and blocks one that crosses a Limit in force', () => {
  const frame = pictured(session.frames[1], look, 'She stands at the rail.')
  assertEquals(
    frame.promptText,
    'adult, Mira Vance, a tall woman of 34. She stands at the rail. An oil painting.',
  )
  assertEquals(frame.blocked, undefined)
  const bare = pictured(session.frames[1], look, 'She wears only a towel.')
  assertEquals(bare.blocked, 'no sexual or nude imagery')
  setLimitsEnabled(false)
  try {
    assertEquals(pictured(session.frames[1], look, 'She wears only a towel.').blocked, undefined)
    assertEquals(
      pictured(session.frames[1], look, 'A child at the rail.').blocked,
      'everyone depicted must be an adult',
    )
  } finally {
    setLimitsEnabled(true)
  }
})

Deno.test('wholeSentences drops a sentence the length cap cut off', () => {
  assertEquals(wholeSentences({ pose: 'She stands. He sits at the bar. In' }), {
    pose: 'She stands. He sits at the bar.',
  })
  assertEquals(wholeSentences({ pose: 'She stands' }), { pose: 'She stands' })
  assertEquals(wholeSentences({ pose: 'She says "go."' }), { pose: 'She says "go."' })
})
