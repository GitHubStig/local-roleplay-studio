import { assertEquals, assertMatch, assertStringIncludes, assertThrows } from '@std/assert'
import { DEFAULT_SETTINGS } from '../settings.ts'
import { briefScenario } from '../scenario.ts'
import { testScenario } from '../testing.ts'
import {
  CastError,
  castMessages,
  cleanReply,
  openingMessages,
  parseCast,
  parseReplyText,
  replyContent,
  roleplayMessages,
  roleplaySystem,
} from './prompt.ts'
import { replyOf, testCast } from './testing.ts'
import type { RoleplaySession } from './types.ts'

const session = (frames: RoleplaySession['frames']): RoleplaySession => ({
  id: 'r1',
  kind: 'roleplay',
  brief: 'A storm at sea.',
  scenarioId: null,
  settings: DEFAULT_SETTINGS,
  seed: 1,
  createdAt: '2026-09-27T00:00:00.000Z',
  cast: testCast,
  frames,
})

const frame = (index: number, message: string | null, dialogue: string) => ({
  index,
  message,
  reply: replyOf(dialogue),
  pictures: [],
  createdAt: '2026-09-27T00:00:00.000Z',
})

Deno.test('roleplaySystem names who plays whom, the Setting, the reply fields and the Limits', async () => {
  // Lines wrap mid-sentence in the prompt file; compare as flowing text.
  const system = (await roleplaySystem(testCast)).replace(/\s+/g, ' ')
  assertStringIncludes(system, 'You are Mira Vance')
  assertStringIncludes(system, 'The player plays Sam Reyes')
  assertStringIncludes(system, 'weather: A gale.')
  assertStringIncludes(system, "Never write Sam Reyes's actions, words or thoughts")
  assertMatch(system, /"internal"[\s\S]*"actions"[\s\S]*"dialogue"/)
  assertStringIncludes(system, 'Everyone in the story is an adult')
})

Deno.test('roleplayMessages: the system message, the opening request, then turns, then the new message', async () => {
  const s = session([
    frame(0, null, 'You are late.'),
    frame(1, 'Sorry, captain.', 'Take the wheel.'),
  ])
  const messages = await roleplayMessages(s, 'I take the wheel.')
  // Turns alternate from the start: the Character's opening answers the request that asked for it.
  assertEquals(
    messages.map((m) => m.role),
    ['system', 'user', 'assistant', 'user', 'assistant', 'user'],
  )
  assertEquals(messages.slice(0, 2), await openingMessages(s.cast!))
  assertEquals(messages[3].content, 'Sorry, captain.')
  assertEquals(messages.at(-1)!.content, 'I take the wheel.')
  // Earlier replies go back as the same JSON, fields in writing order.
  assertEquals(
    messages[2].content,
    '{"internal":"","actions":"Mira grips the wheel.","dialogue":"You are late."}',
  )
})

Deno.test('replyContent always writes the fields in order', () => {
  assertEquals(
    Object.keys(JSON.parse(replyContent({ dialogue: 'a', actions: 'b', internal: 'c' }))),
    ['internal', 'actions', 'dialogue'],
  )
})

Deno.test('parseReplyText trims fields and needs actions or dialogue', () => {
  assertEquals(
    parseReplyText('{"internal":" hm ","actions":" She waits. ","dialogue":""}'),
    { internal: 'hm', actions: 'She waits.', dialogue: '' },
  )
  assertThrows(() => parseReplyText('{"internal":"x","actions":"","dialogue":""}'))
  assertEquals(
    parseReplyText('{"internal":"","actions":"He waits.","dialogue":"..."}').dialogue,
    '',
  )
  assertThrows(() => parseReplyText('not json'), Error, 'valid JSON')
})

Deno.test('parseCast refuses a Character under 18 and lists missing fields', () => {
  assertEquals(parseCast(testCast), testCast)
  const young = { ...testCast, character: { ...testCast.character, age: 17 } }
  assertThrows(() => parseCast(young), CastError, '18 or over')
  const gaps = { ...testCast, setting: { ...testCast.setting, weather: ' ' } }
  assertThrows(() => parseCast(gaps), CastError, 'setting weather is missing')
})

Deno.test('openingMessages asks the Character to open the scene, under the same system message', async () => {
  const [system, request] = await openingMessages(testCast)
  assertEquals(system.content, await roleplaySystem(testCast))
  assertEquals(request.role, 'user')
  assertStringIncludes(request.content.replace(/\s+/g, ' '), 'Open it as Mira Vance')
})

Deno.test('castMessages gives a Scenario its Setup facts, and a typed Brief none', async () => {
  const [, typed] = await castMessages(briefScenario('A storm at sea.'))
  assertStringIncludes(typed.content, 'A storm at sea.')
  assertStringIncludes(typed.content, 'Facts:\n\nnone')
  const [system, fromScenario] = await castMessages(testScenario)
  assertStringIncludes(system.content, 'If the Persona pushes toward any of these')
  assertEquals(fromScenario.content.includes('Facts:\n\nnone'), false)
})

Deno.test('cleanReply takes quote marks and JSON leftovers off, and quotes alone mean silence', () => {
  const clean = (dialogue: string, actions = 'She waits.') =>
    cleanReply({ internal: '', actions, dialogue })
  assertEquals(clean('"I\'m quite well, Mr. Vance."').dialogue, "I'm quite well, Mr. Vance.")
  assertEquals(clean('“Keep going. Please.”}').dialogue, 'Keep going. Please.')
  assertEquals(
    clean("“N-nothing is wrong,” she answers, “simply... a bit warm.”}'}'}").dialogue,
    'N-nothing is wrong,” she answers, “simply... a bit warm.',
  )
  assertEquals(clean('"').dialogue, '')
  assertEquals(clean('...').dialogue, '')
  assertEquals(clean('Fine.', 'She nods."}').actions, 'She nods.')
  // Quotes inside the speech stay.
  assertEquals(clean('He said "no" twice.').dialogue, 'He said "no" twice.')
})
