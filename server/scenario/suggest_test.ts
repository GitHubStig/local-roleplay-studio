import { assertEquals, assertStringIncludes } from '@std/assert'
import { scenarioFrom } from '../scenario.ts'
import { cleanSuggestion, partOf, suggestMessages } from './suggest.ts'

const scenario = scenarioFrom({
  title: 'T',
  opening: 'O',
  people: [{ id: 'p1', name: 'Kael' }],
})

Deno.test("partOf names a story's part or a Person's, by their name", () => {
  assertEquals(partOf(scenario, 'time'), 'the Time: the time of day, and the weather')
  assertStringIncludes(partOf(scenario, 'music')!, 'the Music')
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

Deno.test('Suggest leaves out what the part holds, and sends what was typed as notes', async () => {
  const typed = { ...scenario, people: [{ ...scenario.people[0], goal: 'Revenge.' }] }
  const [, fresh] = await suggestMessages({ scenario: typed, field: 'people.p1.goal', notes: '' })
  assertEquals(fresh.content.includes('Revenge.'), false)
  const [, built] = await suggestMessages({
    scenario: typed,
    field: 'people.p1.goal',
    notes: 'Revenge.',
  })
  assertStringIncludes(built.content, 'to build on: Revenge.')
})
