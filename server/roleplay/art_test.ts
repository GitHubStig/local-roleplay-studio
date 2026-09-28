import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import { setLimitsEnabled } from '../limits.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import {
  artFrameMessages,
  parseRoleplayLook,
  parseShown,
  pictured,
  storyText,
  wholeSentences,
} from './art.ts'
import { replyOf, testCast } from './testing.ts'
import type { RoleplaySession } from './types.ts'

const look = {
  character: 'Mira Vance, a tall woman of 34.',
  persona: 'Sam Reyes, a slight man of 25.',
  style: 'An oil painting.',
}

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
  const frame = pictured(session.frames[1], look, testCast, 'She stands at the rail.', 'character')
  assertEquals(
    frame.promptText,
    'adult, Mira Vance, a tall woman of 34. She stands at the rail. An oil painting.',
  )
  assertEquals(frame.shown, 'character')
  assertEquals(
    pictured(session.frames[1], look, testCast, 'They talk.').prompt,
    'Mira Vance, a tall woman of 34. Sam Reyes, a slight man of 25. They talk. An oil painting.',
  )
  assertEquals(frame.blocked, undefined)
  const bare = pictured(session.frames[1], look, testCast, 'She wears only a towel.')
  assertEquals(bare.blocked, 'no sexual or nude imagery')
  setLimitsEnabled(false)
  try {
    assertEquals(
      pictured(session.frames[1], look, testCast, 'She wears only a towel.').blocked,
      undefined,
    )
    assertEquals(
      pictured(session.frames[1], look, testCast, 'A child at the rail.').blocked,
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

Deno.test('parseShown and parseRoleplayLook', () => {
  const shown = (character: unknown, persona: unknown) =>
    parseShown({ character_shown: character, persona_shown: persona })
  assertEquals([shown(true, false), shown(false, true), shown(true, true), shown(false, false)], [
    'character',
    'persona',
    'both',
    'none',
  ])
  assertEquals(parseShown({}), 'both')
  assertEquals(parseRoleplayLook(look), look)
  assertThrows(() => parseRoleplayLook({ character: 'Mira.', style: 'Ink.' }), Error, 'identities')
})

Deno.test('While the Limits are on, a picture of both people must name what each wears', () => {
  const frame = session.frames[1]
  const both = (clothing: string) => pictured(frame, look, testCast, 'They talk.', 'both', clothing)
  assertEquals(both('Mira wears a coat; Sam wears oilskins.').blocked, undefined)
  assertEquals(
    both('Mira wears a heavy coat.').blocked,
    "everyone shown must be dressed (name each person's clothes)",
  )
  // One person shown: "She wears…" is fine.
  assertEquals(
    pictured(frame, look, testCast, 'She waits.', 'character', 'She wears a coat.').blocked,
    undefined,
  )
  setLimitsEnabled(false)
  try {
    assertEquals(both('Mira wears a heavy coat.').blocked, undefined)
  } finally {
    setLimitsEnabled(true)
  }
})

Deno.test('A rendered picture whose Image Prompt changes is marked stale', () => {
  const rendered = {
    ...pictured(session.frames[1], look, testCast, 'She waits.', 'character'),
    image: 'frame-1-aaaaaaaa.png',
  }
  assertEquals(pictured(rendered, look, testCast, 'She waits.', 'character').stale, undefined)
  assertEquals(pictured(rendered, look, testCast, 'She runs.', 'character').stale, true)
})

Deno.test('A picture of no one has no identity sentences', () => {
  const empty = pictured(session.frames[1], look, testCast, 'The door stands closed.', 'none')
  assertEquals(empty.prompt, 'The door stands closed. An oil painting.')
  assertEquals(empty.promptText, 'adult, The door stands closed. An oil painting.')
  assertEquals(empty.blocked, undefined)
})
