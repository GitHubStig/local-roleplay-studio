import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import {
  mightNameAPerson,
  outputSchema,
  parseFrameBody,
  parseFrameText,
  plainSentences,
  realPersonQuestion,
  storyboardPlanSchema,
  systemMessage,
  userMessage,
} from './textModel.ts'
import { promptWith, testScenario } from './testing.ts'

Deno.test('systemMessage has the paragraph rules, the order, the limits and the notes', async () => {
  const msg = await systemMessage(testScenario, false)
  assertStringIncludes(msg, 'one paragraph of exactly nine sentences')
  assertStringIncludes(msg, '1. subject and identity:')
  assertStringIncludes(msg, '9. art style and medium:')
  assertStringIncludes(msg, 'Never leave the old detail')
  assertStringIncludes(msg, 'everyone depicted is an adult')
  assertStringIncludes(msg, 'Rules.')
})

Deno.test('systemMessage gives the Setup only on the Opening Frame', async () => {
  assertStringIncludes(await systemMessage(testScenario, true), 'location: a studio')
  assertEquals((await systemMessage(testScenario, false)).includes('location: a studio'), false)
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

Deno.test('realPersonQuestion says style references are not real people', async () => {
  assertStringIncludes(await realPersonQuestion('art style is Michelangelo'), 'style to imitate')
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
      "he's frightened. art style is Hokusai / Japanese woodblock",
      'paint it in the style of Frida Kahlo',
      'inspired by Annie Leibovitz, moody',
    ]
  ) {
    assertEquals(mightNameAPerson(a), false, a)
  }
})

Deno.test('plainSentences strips aspect labels and list markers a model writes in', () => {
  assertEquals(
    plainSentences(
      'He sprints; calves taut.- Expression: Intense focus.\n- Camera angle and framing: Low 24mm. Lighting: harsh.',
    ),
    'He sprints; calves taut. Intense focus. Low 24mm. harsh.',
  )
  assertEquals(
    plainSentences('Her style: bold. A man. 3. Colour: teal.'),
    'Her style: bold. A man. teal.',
  )
})

Deno.test('parseFrameBody joins the seven fields into one paragraph, in order', () => {
  assertEquals(
    parseFrameBody({
      color: 'Grey tones',
      pose: 'He leaps',
      expression: 'Fierce focus.',
      camera: 'Low angle, 24mm',
      clothing: 'White jersey',
      environment: 'An empty indoor court',
      lighting: 'Hard spotlight',
    }),
    'He leaps. Fierce focus. Low angle, 24mm. White jersey. An empty indoor court. Hard spotlight. Grey tones.',
  )
  assertEquals(parseFrameBody({ body: 'Already a paragraph.' }), 'Already a paragraph.')
  assertThrows(() => parseFrameBody({ pose: 'x' }), Error, 'missing: expression, camera')
})

Deno.test('storyboardPlanSchema requires all seven fields for every Frame', () => {
  const schema = storyboardPlanSchema(4)
  assertEquals(schema.properties.frames.minItems, 4)
  assertEquals(schema.properties.frames.items.required, [
    'pose',
    'expression',
    'camera',
    'clothing',
    'environment',
    'lighting',
    'color',
  ])
})
