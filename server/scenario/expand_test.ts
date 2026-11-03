import { assertEquals } from '@std/assert'
import { parseScenario } from '../scenario.ts'
import { expanded } from './expand.ts'

const blank = { looks: '', wears: '', personality: '', speaks: '', background: '', goal: '' }

Deno.test('Expand sorts a Brief into its parts, and suggests only for what stays blank', () => {
  const { scenario, suggestions } = expanded({ brief: 'A lighthouse keeper; I wash up.' }, {
    title: 'The Keeper',
    description: 'A storm, a stranger.',
    opening: 'Mara finds Ned on the rocks.',
    place: 'A lighthouse.',
    time: '',
    style: '',
    truths: [],
    people: [
      { name: 'Mara', ...blank, looks: 'Grey-haired.', truths: [] },
      { name: 'Ned', ...blank, truths: [] },
      { name: 'mara', ...blank, truths: [] },
    ],
    player: 'Ned',
    character: 'Mara',
    suggestions: [
      { person: '', field: 'time', text: 'A winter night.' },
      { person: '', field: 'place', text: 'Not blank.' },
      { person: 'Mara', field: 'goal', text: 'Keep the light lit.' },
      { person: 'Mara', field: 'goal', text: 'A second one.' },
      { person: 'Mara', field: 'looks', text: 'Not blank.' },
      { person: 'Nobody', field: 'goal', text: 'Not one of the People.' },
      { person: '', field: 'goal', text: 'Not a part of the story.' },
    ],
  })
  assertEquals(scenario.people.map((p) => [p.id, p.looks]), [['mara', 'Grey-haired.'], ['ned', '']])
  assertEquals([scenario.title, scenario.opening, scenario.place], [
    'The Keeper',
    'Mara finds Ned on the rocks.',
    'A lighthouse.',
  ])
  assertEquals([scenario.player, scenario.character], ['ned', 'mara'])
  assertEquals(suggestions, [
    { field: 'time', text: 'A winter night.' },
    { field: 'people.mara.goal', text: 'Keep the light lit.' },
  ])
})

Deno.test('Expand keeps a Brief as the Opening when the model writes none', () => {
  const { scenario } = expanded({ brief: 'A knight in fog.' }, {})
  assertEquals([scenario.title, scenario.opening, scenario.people], [
    'A knight in fog.',
    'A knight in fog.',
    [],
  ])
})

Deno.test("Expand keeps what a Scenario states, adding only who's who", () => {
  const stated = parseScenario(
    'tavern',
    `---
title: The Tavern
description: A short test.
character: Kael
---
## Opening
Kael waits; a stranger comes in.
## People
### Kael
- Goal: find who sent the letter.
### Elara
`,
  )
  const reply = {
    title: 'Another title',
    opening: 'Rewritten.',
    place: 'Invented.',
    people: [{ name: 'Thomas', ...blank, truths: [] }],
    player: 'Elara',
    character: 'Elara',
  }
  assertEquals(expanded({ scenario: stated }, reply).scenario, { ...stated, player: 'elara' })
  // A Scenario that lists nobody gets its People named.
  const nobody = { ...stated, people: [], character: undefined }
  assertEquals(expanded({ scenario: nobody }, reply).scenario.people, [
    { id: 'thomas', name: 'Thomas', ...blank, truths: [] },
  ])
})
