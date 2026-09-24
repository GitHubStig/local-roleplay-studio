import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import { outputSchema, parseTurnText, systemMessage, userMessage } from './textModel.ts'
import { testScenario } from './testing.ts'

Deno.test('systemMessage includes the rules, the Setup and the output format', () => {
  const msg = systemMessage(testScenario)
  assertStringIncludes(msg, 'Rules.')
  assertStringIncludes(msg, 'location: a studio')
  assertStringIncludes(msg, 'rendered from the Scene alone')
})

Deno.test('userMessage uses the opening prompt on the Opening Turn', () => {
  const msg = userMessage({ scenario: testScenario, scene: null, action: null })
  assertStringIncludes(msg, 'Opening Turn')
  assertStringIncludes(msg, 'Start.')
})

Deno.test('userMessage sends only the current Scene and the Action', () => {
  const msg = userMessage({ scenario: testScenario, scene: { pose: 'standing' }, action: 'Sit' })
  assertStringIncludes(msg, '"pose": "standing"')
  assertStringIncludes(msg, 'Sit')
})

Deno.test('outputSchema embeds the Scenario scene schema', () => {
  assertEquals(outputSchema(testScenario).properties.scene, testScenario.sceneSchema)
})

Deno.test('parseTurnText accepts a complete reply', () => {
  const text = parseTurnText(
    JSON.stringify({ outcome: 'done', narration: ' Hi. ', scene: { pose: 'x' } }),
    testScenario,
  )
  assertEquals(text.narration, 'Hi.')
})

Deno.test('parseTurnText rejects an unknown outcome', () => {
  assertThrows(
    () =>
      parseTurnText(
        JSON.stringify({ outcome: 'maybe', narration: 'x', scene: { pose: 'x' } }),
        testScenario,
      ),
    Error,
    'no valid outcome',
  )
})

Deno.test('parseTurnText rejects bad replies', () => {
  assertThrows(() => parseTurnText('nope', testScenario), Error, 'not valid JSON')
  assertThrows(
    () => parseTurnText(JSON.stringify({ outcome: 'done', narration: 'x' }), testScenario),
    Error,
    'no scene',
  )
  assertThrows(
    () =>
      parseTurnText(
        JSON.stringify({ outcome: 'done', narration: 'x', scene: {} }),
        testScenario,
      ),
    Error,
    'missing: pose',
  )
})
