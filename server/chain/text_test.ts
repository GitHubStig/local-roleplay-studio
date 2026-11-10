import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import { outputSchema, parseFrameText, systemMessage, userMessage } from './text.ts'
import { promptWith, testScenario } from '../testing.ts'

Deno.test('systemMessage has the paragraph rules, the order, the limits and the notes', async () => {
  const msg = await systemMessage(testScenario, false)
  assertStringIncludes(msg, 'one paragraph of exactly nine sentences, one per aspect')
  assertStringIncludes(msg, '1. subject and identity:')
  assertStringIncludes(msg, '9. art style and medium:')
  assertStringIncludes(msg, 'Never leave the old detail')
  assertEquals(msg.includes('everyone depicted is an adult'), false)
  assertStringIncludes(msg, 'No sexual or nude content')
  assertStringIncludes(msg, 'Rules.')
})

Deno.test("systemMessage gives the Scenario's facts only on the Opening Frame", async () => {
  assertStringIncludes(await systemMessage(testScenario, true), 'place: A studio.')
  assertEquals((await systemMessage(testScenario, false)).includes('place: A studio.'), false)
})

Deno.test('userMessage uses the opening instructions on the Opening Frame', async () => {
  const msg = await userMessage({ scenario: testScenario, prompt: null, action: null })
  assertStringIncludes(msg, 'This is the opening')
  assertStringIncludes(msg, 'Start.')
})

Deno.test('userMessage sends only the current Image Prompt and the Action', async () => {
  const msg = await userMessage({
    scenario: testScenario,
    prompt: promptWith('standing'),
    action: 'Sit',
  })
  assertStringIncludes(msg, 'A person, standing,')
  assertStringIncludes(msg, 'Sit')
  assertEquals(msg.includes("aren't in it now"), false)
})

Deno.test('userMessage adds everyone away, for someone brought back', async () => {
  const msg = await userMessage({
    scenario: testScenario,
    prompt: promptWith('standing'),
    action: 'She comes back',
    away: ['the traveller is slender'],
  })
  assertStringIncludes(msg, "aren't in it now")
  assertStringIncludes(msg, '- the traveller is slender')
})

Deno.test('outputSchema asks for the outcome first, then one prompt string', () => {
  const schema = outputSchema()
  assertEquals(Object.keys(schema.properties), ['outcome', 'narration', 'prompt'])
  assertEquals(schema.properties.prompt.type, 'string')
})

Deno.test('parseFrameText accepts a complete reply and flattens the paragraph', () => {
  const text = parseFrameText(
    JSON.stringify({
      outcome: 'done',
      narration: ' Pose: sitting. ',
      prompt: ' A woman,\n\n sitting. ',
    }),
  )
  assertEquals(text.narration, 'Pose: sitting.')
  assertEquals(text.prompt, 'A woman, sitting.')
})

Deno.test('parseFrameText rejects bad replies', () => {
  assertThrows(() => parseFrameText('nope'), Error, 'not valid JSON')
  assertThrows(
    () => parseFrameText(JSON.stringify({ outcome: 'maybe', narration: 'x', prompt: 'x' })),
    Error,
    'no valid outcome',
  )
  assertThrows(
    () => parseFrameText(JSON.stringify({ outcome: 'done', narration: 'x', prompt: '  ' })),
    Error,
    'no prompt',
  )
})
