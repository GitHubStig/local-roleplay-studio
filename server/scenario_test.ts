import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import { join } from '@std/path'
import {
  briefScenario,
  combinedScenarioLibrary,
  dirScenarioLibrary,
  factsOf,
  parseScenario,
  scenarioFrom,
  scenarioMarkdown,
  truthsOf,
} from './scenario.ts'

const valid = `---
title: The Tavern
description: A short test.
player: Elara
character: Kael
---

## Opening

Kael looks up
as the door opens.

Rain blows in.

## Place

A small tavern
by the harbour.

## Time

Late evening, in a storm.

## Truths

- It's the 18th century.
- Nobody comes to help
  on a night like this.

## People

### Kael

- Looks: a 42-year-old man with a scarred face.
- Wears: a leather apron.
- Goal: find who sent the letter.
- Truths:
  - He's stronger than anyone in the room.
  - He never sells out a crewmate.

### Elara

- Looks: a young woman with dark hair.
`

Deno.test('parseScenario reads every section, joining lines, and who plays whom', () => {
  const s = parseScenario('tavern', valid)
  assertEquals(s.id, 'tavern')
  assertEquals(s.title, 'The Tavern')
  assertEquals(s.opening, 'Kael looks up as the door opens.\n\nRain blows in.')
  assertEquals(s.place, 'A small tavern by the harbour.')
  assertEquals(s.time, 'Late evening, in a storm.')
  assertEquals(s.style, '')
  assertEquals(s.truths, ["It's the 18th century.", 'Nobody comes to help on a night like this.'])
  assertEquals(s.people.map((p) => p.id), ['kael', 'elara'])
  assertEquals(s.people[0], {
    id: 'kael',
    name: 'Kael',
    looks: 'a 42-year-old man with a scarred face.',
    wears: 'a leather apron.',
    personality: '',
    speaks: '',
    background: '',
    goal: 'find who sent the letter.',
    truths: ["He's stronger than anyone in the room.", 'He never sells out a crewmate.'],
  })
  assertEquals([s.player, s.character], ['elara', 'kael'])
})

Deno.test('scenarioMarkdown writes what parseScenario reads back', () => {
  const s = parseScenario('tavern', valid)
  assertEquals(parseScenario('tavern', scenarioMarkdown(s)), s)
  const min = parseScenario('min', `---\ntitle: T\ndescription: D\n---\n## Opening\nGo.\n`)
  assertEquals(scenarioMarkdown(min), `---\ntitle: T\ndescription: D\n---\n\n## Opening\n\nGo.\n`)
})

Deno.test('parseScenario lists every problem at once', () => {
  const text = `---
title: ""
setup: x
player: Nobody
---

## System

x

## People

### Kael

- Height: tall
stray

### kael
`
  const err = assertThrows(() => parseScenario('bad', text))
  for (
    const expected of [
      'title',
      'description',
      'frontmatter "setup"',
      'section "System"',
      '"## Opening"',
      'Kael: unknown line "Height"',
      'Kael: "stray"',
      'two people are called "kael"',
      'player "Nobody"',
    ]
  ) {
    if (!(err as Error).message.includes(expected)) {
      throw new Error(`missing "${expected}" in: ${(err as Error).message}`)
    }
  }
})

Deno.test("scenarioFrom keeps a renamed Person's id, so who plays whom holds", () => {
  const sent = parseScenario('tavern', valid)
  const kael = { ...sent.people[0], name: 'Tom', goal: '  a drink ' }
  const scenario = scenarioFrom({ ...sent, people: [kael, sent.people[1]] })
  assertEquals(scenario.people[0], { ...kael, goal: 'a drink' })
  assertEquals([scenario.player, scenario.character], ['elara', 'kael'])
})

Deno.test('scenarioFrom lists every problem at once', () => {
  const err = assertThrows(() =>
    scenarioFrom({
      title: '',
      opening: 3,
      people: [{ name: 'Ann' }, { name: 'ann' }, { truths: 'x' }],
      player: 'bob',
    })
  )
  for (
    const issue of [
      'opening must be text',
      'two people are called "ann"',
      'Truths must be a list of text',
      'every Person needs a name',
      "the player isn't one of the People",
      'it needs a title',
    ]
  ) assertStringIncludes((err as Error).message, issue)
})

Deno.test('parseScenario rejects a file without frontmatter', () => {
  assertThrows(() => parseScenario('bare', '# just markdown'))
})

Deno.test("truthsOf lists the story's Truths, then each Person's by name", () => {
  assertEquals(
    truthsOf(parseScenario('tavern', valid)),
    [
      "- It's the 18th century.",
      '- Nobody comes to help on a night like this.',
      "- Kael: He's stronger than anyone in the room.",
      '- Kael: He never sells out a crewmate.',
    ].join('\n'),
  )
  assertEquals(truthsOf(briefScenario('Go.')), '')
})

Deno.test('factsOf states only what the Scenario states, and who plays whom when asked', () => {
  const s = parseScenario('tavern', valid)
  const facts = factsOf(s)
  assertStringIncludes(facts, 'place: A small tavern by the harbour.')
  assertStringIncludes(facts, 'goal: find who sent the letter.')
  assertEquals(facts.includes('style'), false)
  assertEquals(facts.includes('personality'), false)
  assertEquals(facts.includes('stronger'), false)
  assertEquals(facts.includes('plays'), false)
  assertStringIncludes(factsOf(s, true), 'the player plays: Elara')
  assertStringIncludes(factsOf(s, true), 'the Text Model plays: Kael')
  assertEquals(factsOf(briefScenario('Go.')), '')
})

Deno.test('dirScenarioLibrary loads valid files and reports broken ones', async () => {
  const dir = await Deno.makeTempDir()
  try {
    await Deno.writeTextFile(join(dir, 'good.md'), valid)
    await Deno.writeTextFile(join(dir, 'broken.md'), '---\ntitle: [\n---\n')
    await Deno.writeTextFile(join(dir, 'notes.txt'), 'ignored')
    const lib = dirScenarioLibrary(dir)
    const { scenarios, errors } = await lib.list()
    assertEquals(scenarios.map((s) => s.id), ['good'])
    assertEquals(errors.map((e) => e.file), ['broken.md'])
    assertEquals((await lib.get('good'))?.title, 'The Tavern')
    assertEquals(await lib.get('broken'), undefined)
  } finally {
    await Deno.remove(dir, { recursive: true })
  }
})

Deno.test('dirScenarioLibrary treats a missing directory as empty', async () => {
  const { scenarios, errors } = await dirScenarioLibrary('/nonexistent/scenarios').list()
  assertEquals(scenarios, [])
  assertEquals(errors, [])
})

Deno.test('combinedScenarioLibrary lists the first library first, and its id over a later one', async () => {
  const library = (ids: string[], title: string) => {
    const scenarios = ids.map((id) => ({ ...parseScenario(id, valid), title }))
    return {
      list: () => Promise.resolve({ scenarios, errors: [{ file: `${title}.md`, message: 'bad' }] }),
      get: (id: string) => Promise.resolve(scenarios.find((s) => s.id === id)),
    }
  }
  const lib = combinedScenarioLibrary(
    library(['tavern'], 'Mine'),
    library(['contact', 'tavern'], 'Example'),
  )
  const { scenarios, errors } = await lib.list()
  assertEquals(scenarios.map((s) => [s.id, s.title]), [['tavern', 'Mine'], ['contact', 'Example']])
  assertEquals(errors.map((e) => e.file), ['Mine.md', 'Example.md'])
  assertEquals((await lib.get('tavern'))?.title, 'Mine')
})
