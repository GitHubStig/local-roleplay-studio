import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert'
import { setLimitsEnabled } from '../limits.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import {
  cleanSuggestion,
  type SuggestEvent,
  suggestMessage,
  suggestMessages,
  typicalLength,
} from './suggest.ts'
import { replyOf, scriptedRoleplayModel, testCast } from './testing.ts'
import type { RoleplayFrame, RoleplaySession } from './types.ts'

const frame = (index: number, message: string | null, dialogue: string): RoleplayFrame => ({
  index,
  message,
  reply: replyOf(dialogue, { internal: `Secret thought ${index}.` }),
  pictures: [],
  createdAt: '2026-09-30T00:00:00.000Z',
})

const session = (frames: RoleplayFrame[]): RoleplaySession => ({
  id: 'r1',
  kind: 'roleplay',
  brief: 'A storm at sea.',
  scenarioId: null,
  settings: DEFAULT_SETTINGS,
  seed: 1,
  createdAt: '2026-09-30T00:00:00.000Z',
  cast: testCast,
  frames,
})

const begun = session([
  frame(0, null, 'You are late.'),
  frame(1, 'I grab the rail.', 'Hold on, then.'),
  frame(2, 'I shout over the wind: where do you need me?', 'At the pumps.'),
])

Deno.test('Suggest reads the story as the Persona knows it, their Messages, and the draft', async () => {
  const [system, request] = await suggestMessages(begun, '  ask about the cargo ')
  assertStringIncludes(system.content, "Write Sam Reyes's next message")
  assertStringIncludes(request.content, 'Mira Vance: Mira grips the wheel. "At the pumps."')
  assertEquals(request.content.includes('Secret thought'), false)
  assertStringIncludes(request.content, '- I grab the rail.\n- I shout over the wind')
  assertStringIncludes(request.content, 'ask about the cargo')

  const [, first] = await suggestMessages(session([frame(0, null, 'You are late.')]), '')
  assertStringIncludes(first.content, 'for their style\n\nnone yet')
  assertStringIncludes(first.content, 'for this message\n\nnone')
})

Deno.test("Suggest is told how long the player's messages usually are", async () => {
  assertEquals(typicalLength([]), 'one or two sentences')
  assertEquals(typicalLength(['give in']), 'about 2 words')
  assertEquals(typicalLength(['make me', 'a b c d e', 'wait']), 'about 2 words')
  assertEquals(typicalLength(['hi']), 'about 1 word')
  const [, request] = await suggestMessages(begun, '')
  assertStringIncludes(request.content, 'usually run to about 10 words')
})

Deno.test('Suggest is told the Limits in force', async () => {
  const system = async () => (await suggestMessages(begun, ''))[0].content
  assertStringIncludes(await system(), 'no sexual or nude content')
  setLimitsEnabled(false)
  try {
    assertEquals((await system()).includes('sexual'), false)
    assertStringIncludes(await system(), 'never involves anyone younger')
  } finally {
    setLimitsEnabled(true)
  }
})

Deno.test('cleanSuggestion drops an introduction, the name in front, and quotes around it', () => {
  assertEquals(cleanSuggestion('"I take the wheel."', 'Sam Reyes'), 'I take the wheel.')
  assertEquals(cleanSuggestion('Sam: I take the wheel.', 'Sam Reyes'), 'I take the wheel.')
  assertEquals(cleanSuggestion('**Sam Reyes:** I nod.', 'Sam Reyes'), 'I nod.')
  assertEquals(
    cleanSuggestion("Here's the message:\nI ask about the cargo.", 'Sam Reyes'),
    'I ask about the cargo.',
  )
  // Quotes inside the message are the player's own.
  assertEquals(
    cleanSuggestion('"Wait," I say. "Where is the captain?"', 'Sam Reyes'),
    '"Wait," I say. "Where is the captain?"',
  )
  assertEquals(cleanSuggestion('Samuel runs.', 'Sam Reyes'), 'Samuel runs.')
})

Deno.test('suggestMessage streams the suggestion, then sends it tidied', async () => {
  const model = scriptedRoleplayModel({ suggestions: ['Sam: I head for the pumps.'] })
  const events: SuggestEvent[] = []
  const text = await suggestMessage(
    model,
    begun,
    '',
    (e) => events.push(e),
    new AbortController().signal,
  )
  assertEquals(text, 'I head for the pumps.')
  assertEquals(events, [
    { type: 'phase', phase: 'text' },
    { type: 'suggestion-part', text: 'Sam: I head f' },
    { type: 'suggestion-part', text: 'Sam: I head for the pumps.' },
    { type: 'suggestion', text: 'I head for the pumps.' },
  ])
  assertEquals(model.suggested.length, 1)
})

Deno.test('A suggestion that is empty or crosses a Limit fails, to be asked again', async () => {
  const signal = new AbortController().signal
  const model = scriptedRoleplayModel({ suggestions: ['""', 'I pull off my shirt, naked.'] })
  await assertRejects(() => suggestMessage(model, begun, '', () => {}, signal), Error, 'nothing')
  await assertRejects(() => suggestMessage(model, begun, '', () => {}, signal), Error, 'limit')
  await assertRejects(
    () => suggestMessage(model, session([]), '', () => {}, signal),
    Error,
    'not begun',
  )
})
