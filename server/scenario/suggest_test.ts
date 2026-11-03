import { assertEquals } from '@std/assert'
import { scenarioFrom } from '../scenario.ts'
import { cleanSuggestion, partOf } from './suggest.ts'

const scenario = scenarioFrom({
  title: 'T',
  opening: 'O',
  people: [{ id: 'p1', name: 'Kael' }],
})

Deno.test("partOf names a story's part or a Person's, by their name", () => {
  assertEquals(partOf(scenario, 'time'), 'the Time: the time of day, and the weather')
  assertEquals(
    partOf(scenario, 'people.p1.goal'),
    "Kael's Goal: what they want in this story, and what drives them",
  )
  for (const field of ['opening', 'people.p2.goal', 'people.p1.name', 'toString']) {
    assertEquals(partOf(scenario, field), undefined)
  }
})

Deno.test('cleanSuggestion leaves the suggestion alone, without a label or quotes', () => {
  assertEquals(cleanSuggestion('Goal: "Find the\n sender."'), 'Find the sender.')
  assertEquals(cleanSuggestion('Late at night: rain.'), 'Late at night: rain.')
})
