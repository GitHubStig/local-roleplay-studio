import { assertEquals, assertMatch, assertNotMatch } from '@std/assert'
import { replyOf, scriptedRoleplayModel, testCast, testScore } from '../testing.ts'
import { withTempDir } from '../../testing.ts'
import { readEvents, settled, setup } from '../../appTesting.ts'
import type { Scenario } from '../../../shared/scenario.ts'
import {
  chunksOf,
  cleanTurns,
  hindsightMessages,
  hindsightSchema,
  scoreRoleplay,
} from './hindsight.ts'
import type { RoleplaySession } from '../../../shared/roleplay.ts'

const turn = (frame: number, decision: string, extra: Record<string, unknown> = {}) => ({
  frame,
  reading: `At ${frame}, the ground shifts.`,
  decision,
  entry: 'gentle',
  line: '',
  ...extra,
})
const cueValues = (mood: string) => ({
  mood,
  energy: 'restrained',
  density: 'sparse',
  tempo: 'slow',
  instruments: ['fiddle'],
  vocals: 'none',
  shape: 'intimate',
  key: 'A minor',
  caption: 'A lone fiddle, then a low cello slips in beneath it.',
  lyrics: '[Intro - lone fiddle]',
})
const lines = ['You are late.', 'Take the wheel.', 'Hold on!', 'We made it.', 'Rest now.']

/** A begun Roleplay of five Frames, with Music on, not yet directed. */
async function played(root: string, script: Parameters<typeof scriptedRoleplayModel>[0]) {
  const model = scriptedRoleplayModel({
    casts: [testCast],
    replies: lines.map((l) => replyOf(l)),
    scores: [testScore()],
    ...script,
  })
  const harness = setup({ root, settings: { textModel: 'x', music: true }, roleplayModel: model })
  const { call } = harness
  await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
  await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
  const after = { picture: false }
  await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin', after))
  for (const text of ['Sorry.', 'A wave!', 'Phew.', 'Yes.']) {
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/messages', { text, ...after }))
  }
  return { ...harness, model }
}
const roleplay = async (call: ReturnType<typeof setup>['call']) =>
  (await (await call('GET', '/api/sessions/s1')).json()) as RoleplaySession

Deno.test("The request names the course, then each turn's parts in the order of their schema, and says how it ends", async () => {
  const session = { ...sessionOf(), score: testScore() }
  const [, request] = await hindsightMessages(session, chunksOf(2)[0], undefined)
  assertEquals(hindsightSchema.required, ['course', 'turns'])
  assertEquals(hindsightSchema.properties.turns.items.required, [
    'frame',
    'reading',
    'decision',
    'entry',
    'line',
  ])
  assertMatch(
    request.content,
    /"course", then\s+"turns", a list of the turns in the order of their Frames, each with "frame", "reading",\s+"decision", "entry", then "line"\. You're done only when the last turn's line is written/,
  )
  assertMatch(request.content, /from Frame 1 to Frame 2\. Answer/)
  assertMatch(request.content, /No music has played yet/)
})

Deno.test('A long story is read in chunks, each reading a few Frames either side of its own', async () => {
  assertEquals(chunksOf(5, { frames: 2, around: 1 }), [
    { first: 0, last: 1, readFrom: 0, readTo: 2 },
    { first: 2, last: 3, readFrom: 1, readTo: 4 },
    { first: 4, last: 4, readFrom: 3, readTo: 4 },
  ])
  // Read whole up to 75 Frames, and in even chunks beyond.
  assertEquals(chunksOf(75).length, 1)
  assertEquals(chunksOf(100), [
    { first: 0, last: 49, readFrom: 0, readTo: 59 },
    { first: 50, last: 99, readFrom: 40, readTo: 99 },
  ])
  assertEquals(chunksOf(160).map((c) => c.last - c.first + 1), [54, 54, 52])

  const session = { ...sessionOf(), score: testScore() }
  const [, middle] = await hindsightMessages(
    session,
    { first: 1, last: 1, readFrom: 0, readTo: 1 },
    undefined,
  )
  assertMatch(middle.content, /from Frame 2 to Frame 2\. The Frames before and after those/)
  const [, whole] = await hindsightMessages(session, chunksOf(2)[0], undefined)
  assertNotMatch(whole.content, /The Frames before and after/)
})

Deno.test("A chunk's turns are kept on its own Frames, in order, one a Frame, a change over a stinger", () => {
  const session = sessionOf()
  assertEquals(
    cleanTurns(
      [
        turn(4, 'transition'),
        turn(1, 'transition', { line: 'Mira Vance: "You are late."' }),
        turn(2, 'stinger'),
        turn(2, 'silence'),
        turn(3, 'transition', { reading: '' }),
        turn(9, 'transition'),
        turn(3, 'nonsense'),
      ],
      0,
      3,
      session,
    ).map((t) => [t.index, t.decision, t.line]),
    [[0, 'transition', 'You are late.'], [1, 'silence', ''], [3, 'transition', '']],
  )
})

Deno.test('Score the Roleplay replaces every Cue: changes, a silence, a stinger, the Frames between continuing', () =>
  withTempDir(async (root) => {
    const { call, model } = await played(root, {
      turns: [[
        turn(1, 'transition'),
        turn(3, 'stinger', { line: 'Hold on!' }),
        turn(4, 'transition', { entry: 'sharp', line: 'We made it.' }),
        turn(5, 'silence'),
      ]],
      cues: [cueValues('wary'), cueValues('relief')],
    })
    const res = await call('POST', '/api/sessions/s1/jobs', {
      kind: 'score-roleplay',
      frameIndex: 0,
    })
    assertEquals(res.status, 201)
    assertEquals(await settled(call), [])
    const s = await roleplay(call)
    // The Score was written first, as there was none.
    assertEquals(s.score, testScore())
    assertEquals(s.cues!.map((c) => [c.start, c.values?.mood, c.entry, c.line]), [
      [0, 'wary', 'gentle', ''],
      [3, 'relief', 'sharp', 'We made it.'],
      [4, undefined, 'gentle', ''],
    ])
    assertEquals(s.frames.map((f) => [f.music!.decision, f.music!.hindsight]), [
      ['transition', true],
      ['continue', true],
      ['continue', true],
      ['transition', true],
      ['silence', true],
    ])
    assertEquals(s.frames[2].music!.stinger, {
      reading: 'At 3, the ground shifts.',
      line: 'Hold on!',
    })
    assertEquals(s.frames[2].music!.cue, s.cues![0].id)
    assertEquals(s.hindsight!.chunks, 1)
    assertEquals(s.hindsight!.courses, ['They drift, then turn.'])
    assertMatch(model.spotted[0][1].content, /Frame 5\n/)
  }))

Deno.test('Chunks are joined: each is told the Cue playing as it begins; before the first change, silence', () =>
  withTempDir(async (root) => {
    const { sessions, model } = await played(root, {
      turns: [[turn(2, 'transition'), turn(3, 'stinger')], [turn(4, 'stinger')], []],
      cues: [cueValues('wary')],
    })
    const session = { ...(await sessions.load('s1')) as RoleplaySession, score: testScore() }
    const scored = await scoreRoleplay(
      { store: sessions, model, chunking: { frames: 2, around: 1 } },
      session,
      {} as Scenario,
      () => {},
      new AbortController().signal,
    )
    assertEquals(model.spotted.length, 3)
    assertMatch(model.spotted[0][1].content, /No music has played yet/)
    assertMatch(model.spotted[1][1].content, /The music playing now, since Frame 2: wary/)
    assertEquals(scored.cues!.map((c) => [c.start, c.values?.mood]), [[0, undefined], [1, 'wary']])
    assertEquals(scored.frames.map((f) => [f.music!.decision, !!f.music!.stinger]), [
      ['silence', false],
      ['transition', false],
      // The first chunk's stinger fell on the next chunk's Frames, so it was dropped.
      ['continue', false],
      ['continue', true],
      ['continue', false],
    ])
  }))

Deno.test("Score the Roleplay can't be queued while Music is off, or before the scene begins", () =>
  withTempDir(async (root) => {
    const model = scriptedRoleplayModel({ casts: [testCast] })
    const { call, settings } = setup({
      root,
      settings: { textModel: 'x', music: true },
      roleplayModel: model,
    })
    await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    const queue = () =>
      call('POST', '/api/sessions/s1/jobs', { kind: 'score-roleplay', frameIndex: 0 })
    assertEquals((await queue()).status, 409)
    await settings.save({ ...await settings.load(), music: false })
    assertEquals((await queue()).status, 409)
  }))

/** A Roleplay of two Frames, as the requests read it. */
function sessionOf(): RoleplaySession {
  return {
    id: 's1',
    kind: 'roleplay',
    brief: 'A storm at sea.',
    scenarioId: null,
    settings: {
      textModel: 'x',
      thinking: false,
      imageModel: 'qwen-image-2.1',
      steps: 8,
      musicBehaviour: 'story',
      musicTaste: '',
    },
    seed: 1,
    createdAt: '',
    cast: testCast,
    look: null,
    cues: [],
    frames: [
      {
        index: 0,
        message: null,
        reply: replyOf(lines[0]),
        pictures: [],
        timings: { text: 1 },
        textModel: 'scripted',
        createdAt: '',
      },
      {
        index: 1,
        message: 'Sorry.',
        reply: replyOf(lines[1]),
        pictures: [],
        timings: { text: 1 },
        textModel: 'scripted',
        createdAt: '',
      },
    ],
  }
}
