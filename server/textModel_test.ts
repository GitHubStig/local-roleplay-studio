import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import {
  mightNameAPerson,
  outputSchema,
  parseFrameText,
  realPersonQuestion,
  systemMessage,
  userMessage,
} from './textModel.ts'
import { promptWith, testScenario } from './testing.ts'

Deno.test('systemMessage has the paragraph rules, the order, the limits and the notes', () => {
  const msg = systemMessage(testScenario, false)
  assertStringIncludes(msg, 'one paragraph of exactly nine sentences')
  assertStringIncludes(msg, '1. subject and identity:')
  assertStringIncludes(msg, '9. art style and medium:')
  assertStringIncludes(msg, 'Never leave the old detail')
  assertStringIncludes(msg, 'everyone depicted is an adult')
  assertStringIncludes(msg, 'Rules.')
})

Deno.test('systemMessage gives the Setup only on the Opening Frame', () => {
  assertStringIncludes(systemMessage(testScenario, true), 'location: a studio')
  assertEquals(systemMessage(testScenario, false).includes('location: a studio'), false)
})

Deno.test('userMessage uses the opening instructions on the Opening Frame', () => {
  const msg = userMessage({ scenario: testScenario, prompt: null, action: null })
  assertStringIncludes(msg, 'This is the opening')
  assertStringIncludes(msg, 'Start.')
})

Deno.test('userMessage sends only the current Image Prompt and the Action', () => {
  const msg = userMessage({ scenario: testScenario, prompt: promptWith('standing'), action: 'Sit' })
  assertStringIncludes(msg, 'A person, standing,')
  assertStringIncludes(msg, 'Sit')
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

Deno.test('realPersonQuestion says style references are not real people', () => {
  assertStringIncludes(realPersonQuestion('art style is Michelangelo'), 'style to imitate')
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
  for (
    const a of [
      'crouch low',
      'teal backdrop, film noir',
      'swap to an 85mm lens',
      "she's scared. art style is Michelangelo / High Renaissance",
      'paint it in the style of Frida Kahlo',
      'inspired by Annie Leibovitz, moody',
    ]
  ) {
    assertEquals(mightNameAPerson(a), false, a)
  }
})
