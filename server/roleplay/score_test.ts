import { assert, assertEquals, assertFalse, assertMatch, assertThrows } from '@std/assert'
import { scriptedRoleplayModel, testCast, testScore } from './testing.ts'
import { withTempDir } from '../testing.ts'
import { readEvents, setup } from '../appTesting.ts'
import { cleanScore, ScoreError, scoreMessages, scoreSchema } from './score.ts'
import type { Scenario } from '../scenario.ts'
import type { RoleplaySession } from './types.ts'

Deno.test('A Score is tidied: trimmed, no blanks or repeats, its tempo in range and in order', () => {
  assertEquals(
    cleanScore({
      genre: ' dark folk ',
      palette: ['fiddle', ' Fiddle', '', 'cello.', 3],
      atmosphere: ' close and cold. ',
      tempo: { slowest: 250, fastest: 12.4 },
      avoid: ['synths', 'SYNTHS', ' '],
    }),
    {
      genre: 'dark folk',
      palette: ['fiddle', 'cello'],
      atmosphere: 'Close and cold.',
      tempo: { slowest: 40, fastest: 200 },
      avoid: ['synths'],
    },
  )
  // A tempo left out takes a middling range.
  assertEquals(cleanScore({ ...testScore(), tempo: undefined }).tempo, {
    slowest: 60,
    fastest: 120,
  })
  assertThrows(() => cleanScore({ ...testScore(), genre: ' ' }), ScoreError, 'genre')
  assertThrows(() => cleanScore({ ...testScore(), palette: [] }), ScoreError, 'instrument')
  assertThrows(() => cleanScore({ ...testScore(), atmosphere: '' }), ScoreError, 'atmosphere')
})

Deno.test("The Score's schema has its parts in the order its request names them", async () => {
  const session = { cast: testCast } as RoleplaySession
  const scenario = { opening: 'A storm at sea.', music: '' } as Scenario
  const [, request] = await scoreMessages(session, scenario, '')
  assertEquals(scoreSchema.required, ['genre', 'palette', 'atmosphere', 'tempo', 'avoid'])
  assertMatch(request.content, /"genre", "palette", "atmosphere", "tempo", then "avoid"/)
  assertMatch(request.content, /done\s+only when the avoid list is written/)
})

Deno.test("The Score's request has the Scenario's Music and the taste, or says there's none", async () => {
  const session = { cast: testCast } as RoleplaySession
  const scenario = { opening: 'A storm at sea.', music: 'Shanties, low and smoky.' } as Scenario
  const [system, withBoth] = await scoreMessages(session, scenario, ' No electronics. ')
  assertMatch(system.content, /from\s+40 to 200/)
  assertMatch(withBoth.content, /A storm at sea\./)
  assertMatch(withBoth.content, /Mira Vance/)
  assertMatch(withBoth.content, /Shanties, low and smoky\./)
  assertMatch(withBoth.content, /taste in music[\s\S]*No electronics\./)

  const none = { opening: 'A storm at sea.', music: ' ' } as Scenario
  const [, neither] = await scoreMessages(session, none, '')
  assertMatch(neither.content, /says nothing of its music/)
  assertFalse(neither.content.includes('taste in music'))
})

Deno.test("A Roleplay's Score is written while Music is on, edited, and its music settings changed", () =>
  withTempDir(async (root) => {
    const model = scriptedRoleplayModel({
      casts: [testCast],
      scores: [testScore(), testScore('jazz')],
    })
    const { call, settings } = setup({
      root,
      settings: { textModel: 'x', musicTaste: 'No synths.' },
      roleplayModel: model,
    })
    await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
    assertEquals((await call('POST', '/api/sessions/s1/roleplay/score')).status, 409)

    const music = async (on: boolean) => settings.save({ ...await settings.load(), music: on })
    await music(true)
    // No Cast yet: nothing to write it from.
    assertEquals((await call('POST', '/api/sessions/s1/roleplay/score')).status, 409)
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    assertEquals((await call('PUT', '/api/sessions/s1/roleplay/score', testScore())).status, 409)

    const written = await readEvents(await call('POST', '/api/sessions/s1/roleplay/score'))
    assertEquals(written.map(([e]) => e), ['phase', 'score'])
    const [, { session }] = written.at(-1)! as [string, { session: RoleplaySession }]
    assertEquals(session.score, testScore())
    assertEquals(session.scoreModel, 'scripted')
    // The Session's own taste, kept as it started.
    assertMatch(model.scored[0][1].content, /No synths\./)

    const again = await readEvents(await call('POST', '/api/sessions/s1/roleplay/score'))
    assertEquals((again.at(-1)![1].session as RoleplaySession).score!.genre, 'jazz')

    const edited = await call('PUT', '/api/sessions/s1/roleplay/score', {
      ...testScore(),
      palette: [' harp ', 'harp'],
    })
    assertEquals((await edited.json()).score.palette, ['harp'])
    const blank = await call('PUT', '/api/sessions/s1/roleplay/score', {
      ...testScore(),
      genre: '',
    })
    assertEquals(blank.status, 400)
    const crossing = { ...testScore(), atmosphere: 'Sexy lingerie and low light.' }
    assertEquals((await call('PUT', '/api/sessions/s1/roleplay/score', crossing)).status, 422)

    const own = { behaviour: 'cinematic', vocals: 'wordless', taste: ' Choirs. ' }
    const changed = await (await call('PUT', '/api/sessions/s1/roleplay/music', own)).json()
    assertEquals(
      [changed.settings.musicBehaviour, changed.settings.musicVocals, changed.settings.musicTaste],
      ['cinematic', 'wordless', 'Choirs.'],
    )
    const wrong = { ...own, vocals: 'lyrics' }
    assertEquals((await call('PUT', '/api/sessions/s1/roleplay/music', wrong)).status, 400)

    await music(false)
    assertEquals((await call('PUT', '/api/sessions/s1/roleplay/music', own)).status, 409)
    assert(model.scored.length === 2)
  }))
