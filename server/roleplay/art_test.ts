import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import { setLimitsEnabled } from '../limits.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import {
  artFrameMessages,
  joinTags,
  parseRoleplayLook,
  parseWho,
  pictured,
  storyText,
  trimFields,
  withNewcomers,
} from './art.ts'
import { replyOf, testCast } from './testing.ts'
import type { RoleplaySession } from './types.ts'

const MIRA = 'Mira Vance'
const SAM = 'Sam Reyes'
const look = {
  people: [
    { name: MIRA, identity: 'Mira Vance, a tall woman of 34.' },
    { name: SAM, identity: 'Sam Reyes, a slight man of 25.' },
  ],
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
  const frame = pictured(session.frames[1], look, 'She stands at the rail.', [MIRA])
  assertEquals(
    frame.prompt,
    'Mira Vance, a tall woman of 34. She stands at the rail. An oil painting.',
  )
  assertEquals(frame.shown, [MIRA])
  assertEquals(
    pictured(session.frames[1], look, 'They talk.', ['mira', 'Sam']).prompt,
    'Mira Vance, a tall woman of 34. Sam Reyes, a slight man of 25. They talk. An oil painting.',
  )
  assertEquals(frame.blocked, undefined)
  const bare = pictured(session.frames[1], look, 'She wears only a towel.', [MIRA])
  assertEquals(bare.blocked, 'no sexual or nude imagery')
  setLimitsEnabled(false)
  try {
    assertEquals(
      pictured(session.frames[1], look, 'She wears only a towel.', [MIRA]).blocked,
      undefined,
    )
    assertEquals(
      pictured(session.frames[1], look, 'A child at the rail.', [MIRA]).blocked,
      'everyone depicted must be an adult',
    )
  } finally {
    setLimitsEnabled(true)
  }
})

Deno.test('trimFields keeps whole sentences within the length, and always the first', () => {
  const long = 'He stands at the window. '.repeat(20).trim()
  const trimmed = trimFields({ pose: long, shown: true }).pose as string
  assertEquals(trimmed.length <= 280, true)
  assertEquals(trimmed.endsWith('window.'), true)
  const one = 'A'.repeat(300) + '.'
  assertEquals(trimFields({ pose: one }), { pose: one })
  assertEquals(trimFields({ pose: 'Short.' }), { pose: 'Short.' })
})

Deno.test('parseWho reads who a picture shows and adds; parseRoleplayLook needs people and a style', () => {
  assertEquals(
    parseWho({
      shown: ['Mira', '', 3, 'the barkeep'],
      newcomers: [{ name: 'the barkeep', identity: 'The barkeep, a stout man of 60.' }, {
        name: 'nobody',
      }],
    }),
    {
      shown: ['Mira', 'the barkeep'],
      newcomers: [{ name: 'the barkeep', identity: 'The barkeep, a stout man of 60.' }],
    },
  )
  assertEquals(parseWho({}), { shown: [], newcomers: [] })
  assertEquals(parseRoleplayLook(look), look)
  assertThrows(() => parseRoleplayLook({ people: [], style: 'Ink.' }), Error, 'people')
})

Deno.test('Newcomers join the Look, unless already in it or crossing a Limit', () => {
  const barkeep = { name: 'the barkeep', identity: 'The barkeep, a stout man of 60.' }
  const grown = withNewcomers(look, [
    barkeep,
    { name: 'Mira', identity: 'Mira again, differently.' },
    { name: 'a boy', identity: 'A 12-year-old boy.' },
  ])
  assertEquals(grown.people.map((p) => p.name), [MIRA, SAM, 'the barkeep'])
  assertEquals(withNewcomers(look, []), look)
  // Shown with the others, with their own identity.
  assertEquals(
    pictured(session.frames[1], grown, 'They talk.', ['Barkeep', MIRA]).prompt,
    'The barkeep, a stout man of 60. Mira Vance, a tall woman of 34. They talk. An oil painting.',
  )
})

Deno.test('While the Limits are on, a picture of two or more people must name what each wears', () => {
  const frame = session.frames[1]
  const both = (clothing: string) => pictured(frame, look, 'They talk.', [MIRA, SAM], clothing)
  assertEquals(both('Mira wears a coat; Sam wears oilskins.').blocked, undefined)
  assertEquals(
    both('Mira wears a heavy coat.').blocked,
    "everyone shown must be dressed (name each person's clothes)",
  )
  // One person shown: "She wears…" is fine. Someone named by a role is named by its word.
  const withBarkeep = withNewcomers(look, [{ name: 'the barkeep', identity: 'A stout man.' }])
  assertEquals(
    pictured(
      frame,
      withBarkeep,
      'They talk.',
      [MIRA, 'the barkeep'],
      'Mira wears a coat; the barkeep an apron.',
    )
      .blocked,
    undefined,
  )
  assertEquals(
    pictured(frame, look, 'She waits.', [MIRA], 'She wears a coat.').blocked,
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
    ...pictured(session.frames[1], look, 'She waits.', [MIRA]),
    image: 'frame-1-aaaaaaaa.png',
  }
  assertEquals(pictured(rendered, look, 'She waits.', [MIRA]).stale, undefined)
  assertEquals(pictured(rendered, look, 'She runs.', [MIRA]).stale, true)
})

Deno.test('A picture of no one has no identity sentences', () => {
  const empty = pictured(session.frames[1], look, 'The door stands closed.', [])
  assertEquals(empty.prompt, 'The door stands closed. An oil painting.')
  assertEquals(empty.blocked, undefined)
})

Deno.test('The tags style asks for tags, and joins them in aspect order', async () => {
  assertStringIncludes((await artFrameMessages(session, 1, 'tags'))[0].content, 'short tags')
  assertEquals((await artFrameMessages(session, 1))[0].content.includes('short tags'), false)
  assertEquals(
    joinTags({
      color: 'grey, silver',
      pose: 'Mira steadying Sam,',
      camera: ' ',
      clothing: 'Mira oilskin coat, Sam wool jumper.',
      shown: ['Mira'],
    }),
    'Mira steadying Sam, Mira oilskin coat, Sam wool jumper, grey, silver',
  )
  assertThrows(() => joinTags({ pose: '', shown: [] }), Error, 'no tags')
})

