import { assertEquals, assertMatch, assertThrows } from '@std/assert'
import { replyOf, scriptedRoleplayModel, testCast, testScore } from './testing.ts'
import { withTempDir } from '../testing.ts'
import { readEvents, settled, setup } from '../appTesting.ts'
import {
  bpmOf,
  cleanCue,
  cleanDirection,
  cueMessages,
  cueSchema,
  directorMessages,
  directorSchema,
  musicStory,
  withDanger,
  withoutSpeaker,
} from './director.ts'
import type { Cue, RoleplaySession } from './types.ts'

const direction = (decision: string, extra: Record<string, unknown> = {}) => ({
  reading: 'Wary, testing each other.',
  decision,
  entry: 'gentle',
  line: '',
  ...extra,
})
const cueValues = (mood = 'guarded, hushed', extra: Record<string, unknown> = {}) => ({
  mood,
  energy: 'restrained',
  density: 'sparse',
  tempo: 'slow',
  instruments: ['fiddle', 'cello'],
  vocals: 'none',
  shape: 'intimate',
  key: 'A minor',
  caption: 'A lone fiddle, then a low cello slips in beneath it.',
  lyrics: '[Intro - lone fiddle]',
  ...extra,
})

const session = (extra: Partial<RoleplaySession> = {}): RoleplaySession => ({
  id: 's1',
  kind: 'roleplay',
  brief: 'A storm at sea.',
  scenarioId: null,
  settings: {
    textModel: 'x',
    thinking: false,
    imageModel: 'qwen-image-2.1',
    steps: 8,
    musicBehaviour: 'steady',
    musicTaste: '',
  },
  seed: 1,
  createdAt: '2026-11-06T00:00:00.000Z',
  cast: testCast,
  look: null,
  cues: [],
  score: testScore(),
  frames: [
    {
      index: 0,
      message: null,
      reply: replyOf('You are late.', { internal: 'He looks like trouble.' }),
      pictures: [],
      timings: { text: 1 },
      textModel: 'scripted',
      createdAt: '',
    },
    {
      index: 1,
      message: 'Sorry.',
      reply: replyOf('Take the wheel.'),
      pictures: [],
      timings: { text: 1 },
      textModel: 'scripted',
      createdAt: '',
    },
  ],
  ...extra,
})

Deno.test("The Director's and the cue writer's requests name their parts in the order of their schemas", async () => {
  const [, director] = await directorMessages(session(), 1, undefined)
  assertEquals(directorSchema.required, ['reading', 'decision', 'entry', 'line'])
  assertMatch(
    director.content,
    /"reading",\s+"decision", "entry", then "line"\. You're done only when the line/,
  )
  const [, cue] = await cueMessages(
    session(),
    1,
    undefined,
    cleanDirection(direction('transition')),
  )
  assertEquals(cueSchema().required, [
    'mood',
    'energy',
    'density',
    'tempo',
    'instruments',
    'vocals',
    'shape',
    'key',
    'caption',
    'lyrics',
  ])
  assertMatch(
    cue.content,
    /"mood", "energy", "density", "tempo",\s+"instruments", "vocals", "shape", "key", "caption", then "lyrics"\. You're done only when the lyrics/,
  )
})

Deno.test('A Cue with no voices keeps only its section tags, as anything else would be sung', () => {
  const lyrics = '[Intro - fiddle]\nOoh... ooh...\n\n[Outro - fading]\nAah...\nThe rain falls'
  assertEquals(
    cleanCue(cueValues('awe', { lyrics })).lyrics,
    '[Intro - fiddle]\n\n[Outro - fading]',
  )
  assertEquals(
    cleanCue(cueValues('awe', { lyrics, vocals: 'choir' })).lyrics,
    lyrics,
  )
  assertThrows(() => cleanCue(cueValues('awe', { lyrics: 'Ooh...' })))
  assertMatch(
    cleanCue(cueValues('awe', { vocals: 'choir' })).caption,
    /beneath it\. A low, soft wordless choir sings in the background throughout\.$/,
  )
  assertEquals(
    cleanCue(
      cueValues('awe', { vocals: 'choir', caption: 'A low choir, then a harp.' }),
    )
      .caption,
    'A low choir, then a harp.',
  )
  assertEquals(cleanCue(cueValues('awe')).caption.includes('choir'), false)
  assertThrows(() => cleanCue(cueValues('awe', { caption: ' ' })))
  assertThrows(() => cleanCue(cueValues('awe', { key: 'H minor' })))
})

Deno.test('A Cue with voices has lines to sing, and one in danger the caption that worked', async () => {
  const voiced = cleanCue(
    cueValues('awe', { vocals: 'choir', lyrics: '[Theme - harp]\n[Outro - fading]' }),
  )
  assertMatch(voiced.lyrics, /^\[Theme - harp\]\n\n\[Choir - soft, wordless\]\nOoh/)
  assertMatch(voiced.lyrics, /\[Outro - fading\]\nAah\.\.\.$/)
  const sung = '[Choir]\nOoh...\nAah...\nOoh...'
  assertEquals(
    cleanCue(cueValues('awe', { vocals: 'choir', lyrics: sung })).lyrics,
    sung,
  )
  const calm = cleanCue(cueValues())
  assertEquals(await withDanger(calm), calm)
  const danger = await withDanger(cleanCue(cueValues('dread', { shape: 'danger' })))
  assertMatch(danger.caption, /^Suspense thriller film score that keeps developing\./)
  assertMatch(danger.lyrics, /^\[Intro - low string pulse/)
  assertEquals([danger.tempo, danger.key, danger.vocals], ['fast', 'D minor', 'none'])
})

Deno.test('Danger is offered only on a sharp change', () => {
  assertEquals(cueSchema('gentle').properties.shape.enum, [
    'intimate',
    'uneasy',
    'reflective',
    'sacred',
  ])
  assertEquals(cueSchema('sharp').properties.shape.enum.includes('danger'), true)
})

Deno.test("A Cue's tempo sits in the Score's range, a fast one at least 100", () => {
  assertEquals(bpmOf('fast', { slowest: 50, fastest: 85 }), 100)
  const range = { slowest: 60, fastest: 120 }
  assertEquals(
    [bpmOf('slow', range), bpmOf('moderate', range), bpmOf('fast', range)],
    [90, 105, 120],
  )
})

Deno.test('The Director reads the Score, the whole story with thoughts, the Behaviour and the Cue playing', async () => {
  const playing: Cue = {
    id: 'cue-a',
    start: 0,
    values: cleanCue(cueValues()),
    entry: 'gentle',
    reading: 'Strangers sizing each other up.',
    line: '',
  }
  const [system, request] = await directorMessages(session(), 1, playing)
  assertMatch(system.content, /Keep the music steady/)
  assertMatch(request.content, /Instruments: fiddle, concertina, bodhrán/)
  assertMatch(request.content, /Mira Vance \(thinks\): He looks like trouble\./)
  assertMatch(request.content, /Sam Reyes: Sorry\./)
  assertMatch(request.content, /since Frame 1: guarded, hushed/)
  assertMatch(request.content, /Why it began: Strangers sizing each other up\./)
  assertMatch(request.content, /Direct the music at Frame 2/)
  const [, first] = await directorMessages(session(), 0, undefined)
  assertMatch(first.content, /No music has played yet/)
  assertEquals(musicStory(session(), 0).includes('Sorry.'), false)
  // Since the Cue began: only the Frames from its first.
  const [, since] = await directorMessages(session(), 1, { ...playing, start: 1 }, 'since')
  assertEquals(
    [since.content.includes('He looks like trouble.'), since.content.includes('Sorry.')],
    [false, true],
  )
})

Deno.test('A Cue has a choir or no voices, and what it says is kept', () => {
  assertEquals(cueSchema().properties.vocals.enum, ['none', 'choir'])
  assertThrows(() => cleanCue(cueValues('awe', { vocals: 'lyrics' })))
  assertEquals(cleanCue(cueValues('awe', { vocals: 'choir' })).vocals, 'choir')
  // Tidied: trimmed, no repeated instrument; none at all is refused.
  assertEquals(
    cleanCue(cueValues(' awe ', { instruments: [' harp', 'Harp', ''] })),
    { ...cueValues('awe'), instruments: ['harp'] },
  )
  assertThrows(() => cleanCue(cueValues('awe', { instruments: [] })))
  assertEquals(cleanCue(cueValues('fragile</')).mood, 'fragile')
  assertEquals(
    cleanDirection(direction('transition', { line: ' "Take the wheel." ' })).line,
    'Take the wheel.',
  )
  assertThrows(() => cleanDirection(direction('stinger')))
  assertEquals(withoutSpeaker('Sam Reyes: Sorry.', session()), 'Sorry.')
  assertEquals(
    withoutSpeaker('Mira Vance: Mira grips the wheel. "You are late."', session()),
    'Mira grips the wheel. "You are late."',
  )
  assertEquals(withoutSpeaker('Mira Vance: "Take the wheel."', session()), 'Take the wheel.')
  // As cleanDirection leaves it, its closing quotation mark already dropped.
  assertEquals(withoutSpeaker('Mira Vance: "Take the wheel.', session()), 'Take the wheel.')
})

/** A begun Roleplay of two Frames, with Music on, whose model directs as `directions` say. */
async function scored(
  root: string,
  directions: Record<string, unknown>[],
  cues: Record<string, unknown>[],
) {
  const model = scriptedRoleplayModel({
    casts: [testCast],
    replies: [replyOf('You are late.'), replyOf('Take the wheel.'), replyOf('Hold on!')],
    scores: [testScore()],
    directions,
    cues,
  })
  const harness = setup({ root, settings: { textModel: 'x', music: true }, roleplayModel: model })
  const { call } = harness
  await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
  await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
  return { ...harness, model }
}
const roleplay = async (call: ReturnType<typeof setup>['call']) =>
  (await (await call('GET', '/api/sessions/s1')).json()) as RoleplaySession

Deno.test('With Score as you play, each Reply is directed: the Score first, a Cue begun, held, then changed', () =>
  withTempDir(async (root) => {
    const { call } = await scored(
      root,
      // The opening's "continue" begins the music, as none plays yet.
      [
        direction('continue'),
        direction('continue'),
        direction('transition', {
          entry: 'sharp',
          line: 'Hold on!',
        }),
      ],
      [cueValues(), cueValues('sudden fear', { energy: 'intense' })],
    )
    const after = { picture: false, direct: true }
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin', after))
    assertEquals(await settled(call), [])
    for (const text of ['Sorry.', 'A wave!']) {
      await readEvents(await call('POST', '/api/sessions/s1/roleplay/messages', { text, ...after }))
      assertEquals(await settled(call), [])
    }
    const s = await roleplay(call)
    assertEquals(s.score, testScore())
    assertEquals(s.cues!.map((c) => [c.start, c.values!.mood, c.entry, c.line]), [
      [0, 'guarded, hushed', 'gentle', ''],
      [2, 'sudden fear', 'sharp', 'Hold on!'],
    ])
    assertEquals(s.frames.map((f) => [f.music!.cue, f.music!.decision]), [
      [s.cues![0].id, 'transition'],
      [s.cues![0].id, 'continue'],
      [s.cues![1].id, 'transition'],
    ])

    // Undone, the Frame and the Cue it began go; its job is cancelled with it.
    await call('DELETE', '/api/sessions/s1/roleplay/frames/2')
    assertEquals((await roleplay(call)).cues!.map((c) => c.start), [0])
  }))

Deno.test('A silence is a Cue with no music; a silence during one continues it', () =>
  withTempDir(async (root) => {
    const { call } = await scored(root, [direction('silence'), direction('silence')], [])
    const after = { picture: false, direct: true }
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin', after))
    await readEvents(
      await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Hm.', ...after }),
    )
    assertEquals(await settled(call), [])
    const s = await roleplay(call)
    assertEquals(s.cues!.map((c) => [c.start, c.values]), [[0, undefined]])
    assertEquals(s.frames.map((f) => f.music!.decision), ['silence', 'continue'])
  }))

Deno.test("The music isn't directed while Music is off, nor without Score as you play", () =>
  withTempDir(async (root) => {
    const { call, settings, model } = await scored(root, [], [])
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin', { picture: false }))
    assertEquals(await settled(call), [])
    assertEquals(model.directedMusic.length, 0)
    await settings.save({ ...await settings.load(), music: false })
    const res = await call('POST', '/api/sessions/s1/jobs', { kind: 'direct', frameIndex: 0 })
    assertEquals(res.status, 409)
  }))
