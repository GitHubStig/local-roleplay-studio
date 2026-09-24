import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import {
  mightNameAPerson,
  outputSchema,
  parseTurnText,
  systemMessage,
  userMessage,
} from './textModel.ts'
import { promptWith, testScenario } from './testing.ts'

Deno.test('systemMessage has the nine-section rules, the limits and the Scenario notes', () => {
  const msg = systemMessage(testScenario, false)
  assertStringIncludes(msg, '"subject" (subject and identity)')
  assertStringIncludes(msg, '"style" (art style and medium)')
  assertStringIncludes(msg, 'everyone depicted is an adult')
  assertStringIncludes(msg, 'Rules.')
})

Deno.test('systemMessage gives the Setup only on the Opening Turn', () => {
  assertStringIncludes(systemMessage(testScenario, true), 'location: a studio')
  assertEquals(systemMessage(testScenario, false).includes('location: a studio'), false)
})

Deno.test('userMessage uses the opening instructions on the Opening Turn', () => {
  const msg = userMessage({ scenario: testScenario, prompt: null, action: null })
  assertStringIncludes(msg, 'first turn')
  assertStringIncludes(msg, 'Start.')
})

Deno.test('userMessage sends only the current Image Prompt and the Action', () => {
  const msg = userMessage({ scenario: testScenario, prompt: promptWith('standing'), action: 'Sit' })
  assertStringIncludes(msg, '"pose": "standing"')
  assertStringIncludes(msg, 'Sit')
})

Deno.test('outputSchema asks for the outcome first and all nine sections', () => {
  const schema = outputSchema()
  assertEquals(Object.keys(schema.properties), ['outcome', 'narration', 'prompt'])
  assertEquals(schema.properties.prompt.required.length, 9)
})

Deno.test('parseTurnText accepts a complete reply', () => {
  const text = parseTurnText(
    JSON.stringify({ outcome: 'done', narration: ' Pose: sitting. ', prompt: promptWith('x') }),
  )
  assertEquals(text.narration, 'Pose: sitting.')
  assertEquals(text.prompt.pose, 'x')
})

Deno.test('parseTurnText rejects bad replies', () => {
  assertThrows(() => parseTurnText('nope'), Error, 'not valid JSON')
  assertThrows(
    () =>
      parseTurnText(JSON.stringify({ outcome: 'maybe', narration: 'x', prompt: promptWith('x') })),
    Error,
    'no valid outcome',
  )
  assertThrows(
    () => parseTurnText(JSON.stringify({ outcome: 'done', narration: 'x' })),
    Error,
    'must be an object',
  )
  assertThrows(
    () =>
      parseTurnText(
        JSON.stringify({
          outcome: 'done',
          narration: 'x',
          prompt: { ...promptWith('x'), color: '' },
        }),
      ),
    Error,
    'missing: color',
  )
})

Deno.test('mightNameAPerson flags names and lookalike requests, not ordinary edits', () => {
  for (
    const a of [
      'make her look like Serena Williams',
      'dress her as Taylor Swift',
      'she resembles a famous actress',
    ]
  ) {
    assertEquals(mightNameAPerson(a), true, a)
  }
  for (const a of ['crouch low', 'teal backdrop, film noir', 'swap to an 85mm lens']) {
    assertEquals(mightNameAPerson(a), false, a)
  }
})
