import { assertEquals, assertRejects, assertThrows } from '@std/assert'
import { argsOf, createBody, follow, parseReplay, stepsOf } from './replay.ts'

Deno.test('a replay file names a kind and a Scenario or a Brief', () => {
  assertEquals(parseReplay('kind: roleplay\nscenario: tavern\nmessages: [hi]').messages, ['hi'])
  assertThrows(() => parseReplay('kind: novel\nscenario: tavern'), Error, 'kind')
  assertThrows(() => parseReplay('kind: chain'), Error, 'scenario or a brief')
  assertThrows(
    () => parseReplay('kind: chain\nscenario: a\nbrief: b'),
    Error,
    'scenario or a brief',
  )
})

Deno.test('the replay files in replays/ parse', async () => {
  for await (const entry of Deno.readDir(new URL('./replays/', import.meta.url))) {
    parseReplay(await Deno.readTextFile(new URL(`./replays/${entry.name}`, import.meta.url)))
  }
})

Deno.test('a Session is created with the Scenario or Brief, and the seed, of the replay', () => {
  assertEquals(createBody({ kind: 'roleplay', scenario: 'tavern', seed: 0 }), {
    kind: 'roleplay',
    scenarioId: 'tavern',
    seed: 0,
  })
  assertEquals(createBody({ kind: 'storyboard', brief: 'b', frameCount: 4 }), {
    kind: 'storyboard',
    brief: 'b',
    frameCount: 4,
  })
})

Deno.test('a Roleplay writes its Cast, begins, then sends each Message', () => {
  const steps = stepsOf({ kind: 'roleplay', scenario: 't', messages: ['a', 'b'] })
  assertEquals(steps.map((s) => [s.path, s.body]), [
    ['roleplay/cast', undefined],
    ['roleplay/begin', undefined],
    ['roleplay/messages', { text: 'a' }],
    ['roleplay/messages', { text: 'b' }],
  ])
})

Deno.test('a Chain makes its Opening Frame, then one for each Action', () => {
  const steps = stepsOf({ kind: 'chain', scenario: 't', actions: ['go'] })
  assertEquals(steps.map((s) => [s.path, s.body]), [['frames', {}], ['frames', { action: 'go' }]])
})

Deno.test('a Storyboard plans, then writes', () => {
  assertEquals(stepsOf({ kind: 'storyboard', brief: 'b' }).map((s) => s.path), ['plan', 'write'])
})

Deno.test('the command line takes a file, a server and --no-pictures', () => {
  assertEquals(argsOf(['r.yaml']), {
    file: 'r.yaml',
    server: 'http://127.0.0.1:8787',
    pictures: true,
  })
  assertEquals(argsOf(['--server', 'http://h:1', '--no-pictures', 'r.yaml']), {
    file: 'r.yaml',
    server: 'http://h:1',
    pictures: false,
  })
})

const events = (...list: object[]) =>
  new Response(list.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join(''))

Deno.test('a work stream that ends well is followed to its end', async () => {
  await follow(events({ type: 'phase', phase: 'text' }, { type: 'done' }))
})

Deno.test('a failed or cancelled work stream, or a refusal, throws', async () => {
  await assertRejects(
    () => follow(events({ type: 'failed', message: 'no model' })),
    Error,
    'no model',
  )
  await assertRejects(() => follow(events({ type: 'cancelled' })), Error, 'cancelled')
  await assertRejects(
    () => follow(Response.json({ error: 'Scenario not found' }, { status: 404 })),
    Error,
    'Scenario not found',
  )
})
