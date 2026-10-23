import { assertEquals, assertMatch } from '@std/assert'
import { replyOf, scriptedRoleplayModel, testCast } from './testing.ts'
import { withTempDir } from '../testing.ts'
import { readEvents, setup } from '../appTesting.ts'

Deno.test("A Roleplay's Cast is written and reviewed, then it begins, is talked to, undone and edited", () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      roleplayModel: scriptedRoleplayModel({
        casts: [testCast, testCast],
        replies: [replyOf('You are late.'), replyOf('Take the wheel.')],
      }),
    })
    const created = await (await call('POST', '/api/sessions', {
      kind: 'roleplay',
      brief: 'A storm at sea.',
    })).json()
    assertEquals([created.kind, created.cast, created.frames], ['roleplay', null, []])
    assertEquals(
      (await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Hi' })).status,
      409,
    )

    const written = await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    assertEquals(written.map(([e]) => e), ['phase', 'cast'])
    // Not begun yet: no Messages, but the Cast can be rewritten.
    assertEquals(
      (await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Hi' })).status,
      409,
    )
    const rewritten = await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    assertEquals(rewritten.at(-1)![0], 'cast')

    const begun = await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin'))
    assertEquals(begun.map(([e]) => e), [
      'phase',
      'reply-part',
      'reply-part',
      'reply-part',
      'replied',
    ])
    assertEquals((await call('POST', '/api/sessions/s1/roleplay/begin')).status, 409)
    assertEquals((await call('POST', '/api/sessions/s1/roleplay/cast')).status, 409)

    assertEquals(
      (await call('POST', '/api/sessions/s1/roleplay/messages', { text: ' ' })).status,
      400,
    )
    const talk = await readEvents(
      await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Sorry, captain.' }),
    )
    assertEquals(talk.map(([e]) => e), [
      'phase',
      'reply-part',
      'reply-part',
      'reply-part',
      'replied',
    ])

    const undone = await (await call('DELETE', '/api/sessions/s1/roleplay/frames/1')).json()
    assertEquals(undone.frames.length, 1)
    assertEquals((await call('DELETE', '/api/sessions/s1/roleplay/frames/0')).status, 409)

    const young = { ...testCast, character: { ...testCast.character, age: 16 } }
    assertEquals((await call('PUT', '/api/sessions/s1/roleplay/cast', young)).status, 400)
    const renamed = { ...testCast, persona: { ...testCast.persona, name: 'Alex' } }
    assertEquals((await call('PUT', '/api/sessions/s1/roleplay/cast', renamed)).status, 400)
    const steered = { ...testCast, character: { ...testCast.character, goal: 'Leave town.' } }
    const edited = await (await call('PUT', '/api/sessions/s1/roleplay/cast', steered)).json()
    assertEquals(edited.cast.character.goal, 'Leave town.')

    const [summary] = await (await call('GET', '/api/sessions')).json()
    assertEquals([summary.kind, summary.frames, summary.latestImage], ['roleplay', 1, null])
    assertEquals(summary.excerpt, 'You are late.')
  }))

Deno.test('Suggest streams a Message for the player, from their draft, and saves nothing', () =>
  withTempDir(async (root) => {
    const model = scriptedRoleplayModel({
      casts: [testCast],
      replies: [replyOf('You are late.')],
      suggestions: ['Sam: I ask about the cargo.'],
    })
    const { call } = setup({
      root,
      settings: { textModel: 'x', thinking: true },
      roleplayModel: model,
    })
    await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
    await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    const suggest = (draft?: unknown) =>
      call('POST', '/api/sessions/s1/roleplay/suggest', draft === undefined ? {} : { draft })
    assertEquals((await suggest()).status, 409)

    await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin'))
    assertEquals((await suggest('x'.repeat(4001))).status, 400)
    const events = await readEvents(await suggest('cargo?'))
    assertEquals(events.map(([e]) => e), [
      'phase',
      'suggestion-part',
      'suggestion-part',
      'suggestion',
    ])
    assertEquals(events.at(-1)![1].text, 'I ask about the cargo.')
    assertMatch(model.suggested[0][1].content, /cargo\?/)
    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(session.frames.length, 1)

    // Out of suggestions: the stream reports the failure, and the Roleplay is free again.
    assertEquals((await readEvents(await suggest())).at(-1)![0], 'failed')
    assertEquals((await suggest()).status, 200)
  }))

Deno.test('A failed first Cast discards the Roleplay; other kinds refuse Roleplay routes', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      roleplayModel: scriptedRoleplayModel({ casts: [new Error('down'), new Error('down')] }),
    })
    await call('POST', '/api/sessions', { kind: 'roleplay', scenarioId: 'test' })
    const events = await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
    assertEquals(events.at(-1)![1], { type: 'failed', message: 'down', sessionDiscarded: true })
    assertEquals((await call('GET', '/api/sessions/s1')).status, 404)

    await call('POST', '/api/sessions', { scenarioId: 'test' })
    assertEquals((await call('POST', '/api/sessions/s2/roleplay/cast')).status, 409)
  }))
