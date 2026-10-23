import { assertEquals, assertMatch } from '@std/assert'
import { planOf, scriptedTextModel, withTempDir } from '../testing.ts'
import { readEvents, readUntil, settled, setup, shown, storyboardFrames } from '../appTesting.ts'

Deno.test('POST /api/sessions makes a Storyboard with a Frame count', () =>
  withTempDir(async (root) => {
    const { call } = setup({ root, settings: { textModel: 'x' } })
    const board = await (await call('POST', '/api/sessions', {
      kind: 'storyboard',
      brief: 'A dunk.',
      frameCount: 5,
    })).json()
    assertEquals([board.kind, board.frameCount, board.look, board.frames], [
      'storyboard',
      5,
      null,
      [],
    ])
    const byDefault =
      await (await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'x' })).json()
    assertEquals(byDefault.frameCount, 8)
    for (const frameCount of [0, 33, 2.5]) {
      assertEquals(
        (await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'x', frameCount }))
          .status,
        400,
      )
    }
  }))

Deno.test('A Storyboard is planned, reviewed, written, rendered and edited over the API', () =>
  withTempDir(async (root) => {
    const newLook = {
      subjects: [{ name: 'Ace', identity: 'Ace, a tall adult athlete.' }],
      style: 'Watercolour.',
    }
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([], [], {
        plans: [planOf(3)],
        edits: [{
          outcome: 'done',
          narration: 'Pose: soaring.',
          body: 'He soars.',
          shown: ['Ace'],
        }],
      }),
    })
    await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'A dunk.', frameCount: 3 })

    const plan = await readEvents(await call('POST', '/api/sessions/s1/plan'))
    assertEquals(plan.map(([e]) => e), [
      'phase',
      'look',
      'planned-beat',
      'planned-beat',
      'planned-beat',
      'planned',
    ])
    assertEquals((await call('POST', '/api/sessions/s1/plan')).status, 409)

    // Reviewed: the Look and a Beat edited by hand; nothing renders until written.
    const look = await (await call('PUT', '/api/sessions/s1/look', newLook)).json()
    assertEquals(look.look, newLook)
    const oldShape = { subject: 'A man.', style: 'Ink.' }
    assertEquals((await call('PUT', '/api/sessions/s1/look', oldShape)).status, 400)
    const beat = await call('PUT', '/api/sessions/s1/frames/1', { beat: 'Ace jumps.', shown: [] })
    assertEquals((await beat.json()).frames[1], {
      ...look.frames[1],
      beat: 'Ace jumps.',
      shown: [],
    })
    assertEquals((await call('PUT', '/api/sessions/s1/frames/1', { beat: 'Nude.' })).status, 422)
    assertEquals(
      (await call('PUT', '/api/sessions/s1/frames/1', { body: 'He lands.' })).status,
      409,
    )
    const early = await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 2 })
    assertEquals(early.status, 409)

    const write = await readEvents(await call('POST', '/api/sessions/s1/write'))
    assertEquals(write.map(([e]) => e), [
      'phase',
      'written-frame',
      'written-frame',
      'written-frame',
      'written',
    ])
    assertEquals((await call('POST', '/api/sessions/s1/write')).status, 409)
    // The plan is fixed now.
    assertEquals((await call('PUT', '/api/sessions/s1/look', newLook)).status, 409)
    assertEquals(
      (await call('PUT', '/api/sessions/s1/frames/1', { beat: 'Ace sits.' })).status,
      409,
    )

    const render = await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 2 })
    assertEquals(render.status, 201)
    assertEquals(await settled(call), [])
    const image = (await storyboardFrames(call))[2].image!
    assertMatch(image, /^frame-2-[0-9a-f]{8}\.png$/)
    const past = await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 9 })
    assertEquals(past.status, 404)

    const byHand = await (await call('PUT', '/api/sessions/s1/frames/2', { body: 'He lands.' }))
      .json()
    assertEquals([byHand.frames[2].body, shown(byHand.frames[2]).stale], ['He lands.', true])
    assertEquals((await call('PUT', '/api/sessions/s1/frames/0', { body: 'Nude.' })).status, 422)
    const nobody = await call('PUT', '/api/sessions/s1/frames/1', { body: 'A hoop.', shown: [] })
    assertEquals((await nobody.json()).frames[1].shown, [])
    const badShown = await call('PUT', '/api/sessions/s1/frames/1', {
      body: 'A hoop.',
      shown: 'Ace',
    })
    assertEquals(badShown.status, 400)

    const edit = await readEvents(
      await call('POST', '/api/sessions/s1/frames/0/edit', { action: 'soar' }),
    )
    const [, edited] = edit.at(-1)!
    assertEquals([
      edited.type,
      edited.outcome,
      (edited.session as { frames: { body: string }[] }).frames[0].body,
    ], [
      'edited',
      'done',
      'He soars.',
    ])

    // Restarted: back to the reviewed plan, the pictures gone.
    const restarted = await (await call('POST', '/api/sessions/s1/restart')).json()
    assertEquals(restarted.frames.map((f: { body: string }) => f.body), ['', '', ''])
    assertEquals(restarted.frames[1].beat, 'Ace jumps.')
    assertEquals((await call('GET', `/api/sessions/s1/images/${image}`)).status, 404)
    assertEquals((await call('PUT', '/api/sessions/s1/look', newLook)).status, 200)
  }))

Deno.test("Beats are added, removed and moved in a Storyboard's plan over the API, until written", () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([], [], { plans: [planOf(2)] }),
    })
    await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'A dunk.', frameCount: 2 })
    // Not planned yet: nowhere to add it.
    assertEquals((await call('POST', '/api/sessions/s1/beats', { at: 0, beat: 'x' })).status, 409)
    await readEvents(await call('POST', '/api/sessions/s1/plan'))

    const added = await call('POST', '/api/sessions/s1/beats', { at: 1, beat: 'Ace pivots.' })
    assertEquals(added.status, 201)
    const frames = (await added.json()).frames as {
      index: number
      beat: string
      shown: string[]
      createdAt: string
    }[]
    assertEquals(frames.map((f) => [f.index, f.beat, f.shown]), [
      [0, 'Beat 1', ['Ace']],
      [1, 'Ace pivots.', ['Ace']],
      [2, 'Beat 2', ['Ace']],
    ])
    const end = await call('POST', '/api/sessions/s1/beats', { at: 3, beat: 'A hoop.', shown: [] })
    assertEquals((await end.json()).frames[3].shown, [])
    for (const bad of [{ at: 5, beat: 'x' }, { at: 0, beat: ' ' }, { at: '1', beat: 'x' }]) {
      assertEquals((await call('POST', '/api/sessions/s1/beats', bad)).status, 400)
    }
    assertEquals(
      (await call('POST', '/api/sessions/s1/beats', { at: 0, beat: 'Nude.' })).status,
      422,
    )

    // And one removed, as the plan was seen; sent again, it's gone already.
    const seen = { frames: 4, createdAt: frames[1].createdAt }
    const removed = await call('POST', '/api/sessions/s1/frames/1/delete', seen)
    assertEquals((await removed.json()).frames.map((f: { beat: string }) => f.beat), [
      'Beat 1',
      'Beat 2',
      'A hoop.',
    ])
    assertEquals((await call('POST', '/api/sessions/s1/frames/1/delete', seen)).status, 409)
    assertEquals((await call('POST', '/api/sessions/s1/frames/1/delete', {})).status, 400)

    // And moved: the last first.
    const order = (body: unknown) => call('PUT', '/api/sessions/s1/beats/order', body)
    const beatsSeen = ['Beat 1', 'Beat 2', 'A hoop.']
    const moved = await order({ order: [2, 0, 1], seen: beatsSeen })
    assertEquals((await moved.json()).frames.map((f: { beat: string }) => f.beat), [
      'A hoop.',
      'Beat 1',
      'Beat 2',
    ])
    assertEquals((await order({ order: [2, 0, 1], seen: beatsSeen })).status, 409)
    for (const bad of [{ order: [0, 1], seen: beatsSeen }, { order: [0, 0, 1], seen: beatsSeen }]) {
      assertEquals((await order(bad)).status, 400)
    }

    const write = await readEvents(await call('POST', '/api/sessions/s1/write'))
    assertEquals(write.filter(([e]) => e === 'written-frame').length, 3)
    const now = { frames: 3, createdAt: frames[0].createdAt }
    assertEquals((await call('POST', '/api/sessions/s1/frames/0/delete', now)).status, 409)
    const writtenSeen = ['A hoop.', 'Beat 1', 'Beat 2']
    assertEquals((await order({ order: [1, 0, 2], seen: writtenSeen })).status, 409)
    assertEquals((await call('POST', '/api/sessions/s1/beats', { at: 0, beat: 'x' })).status, 409)
  }))

Deno.test("Chains and Storyboards refuse each other's routes", () =>
  withTempDir(async (root) => {
    const { call } = setup({ root, settings: { textModel: 'x' } })
    await call('POST', '/api/sessions', { brief: 'A knight.' }) // s1, a Chain
    await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'A dunk.' }) // s2
    assertEquals((await call('POST', '/api/sessions/s1/plan')).status, 409)
    assertEquals((await call('POST', '/api/sessions/s1/write')).status, 409)
    assertEquals((await call('POST', '/api/sessions/s1/restart')).status, 409)
    assertEquals((await call('POST', '/api/sessions/s1/beats', { at: 0, beat: 'x' })).status, 409)
    assertEquals(
      (await call('PUT', '/api/sessions/s1/look', { subjects: [], style: 'b' })).status,
      409,
    )
    assertEquals((await call('POST', '/api/sessions/s2/frames', { action: 'x' })).status, 409)
    assertEquals((await call('DELETE', '/api/sessions/s2/frames/0')).status, 409)
    assertEquals(
      (await call('PUT', '/api/sessions/s2/look', { subjects: [], style: 'b' })).status,
      409,
    )
    // Not planned yet: nothing to write or restart.
    assertEquals((await call('POST', '/api/sessions/s2/write')).status, 409)
    assertEquals((await call('POST', '/api/sessions/s2/restart')).status, 409)
  }))

Deno.test('Cancelling a plan discards the Storyboard', () =>
  withTempDir(async (root) => {
    let release!: () => void
    const hanging = scriptedTextModel([], [], {})
    hanging.planStoryboard = (_req, signal) =>
      new Promise((_, reject) => {
        release = () => reject(signal.reason)
        signal.addEventListener('abort', release, { once: true })
      })
    const { call } = setup({ root, settings: { textModel: 'x' }, textModel: hanging })
    await call('POST', '/api/sessions', { kind: 'storyboard', brief: 'A dunk.' })
    const res = await call('POST', '/api/sessions/s1/plan')
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
    await readUntil(reader, '"phase":"text"')
    assertEquals((await (await call('GET', '/api/sessions/s1')).json()).activity, 'text')
    await call('POST', '/api/sessions/s1/cancel')
    const rest = await readUntil(reader, 'event: cancelled')
    assertEquals(rest.includes('"sessionDiscarded":true'), true)
    assertEquals((await call('GET', '/api/sessions/s1')).status, 404)
  }))
