import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import { join } from '@std/path'
import {
  briefScenario,
  dirScenarioLibrary,
  factsOf,
  parseScenario,
  scenarioFrom,
  scenarioMarkdown,
  seedScenarios,
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

## Music

A lone fiddle,
low and smoky.

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
  assertEquals(s.music, 'A lone fiddle, low and smoky.')
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
  // Dates too, unquoted (a YAML timestamp) or quoted.
  const dated = { ...s, created: '2026-11-01T09:00:00.000Z', modified: '2026-11-03T10:30:00.000Z' }
  assertEquals(parseScenario('tavern', scenarioMarkdown(dated)), dated)
  const unquoted = valid.replace(
    'title: The Tavern',
    'title: The Tavern\ncreated: 2026-11-01T09:00:00Z',
  )
  assertEquals(parseScenario('tavern', unquoted).created, '2026-11-01T09:00:00.000Z')
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

Deno.test("truthsOf doesn't name a Person twice when their Truth starts with their name", () => {
  const s = briefScenario('Go.')
  const kael = parseScenario('tavern', valid).people.find((p) => p.name === 'Kael')!
  const truths = ['Kael never sells out a crewmate.', "Kaelan's ship is his.", 'kael: cannot swim.']
  assertEquals(
    truthsOf({ ...s, people: [{ ...kael, truths }] }),
    ['- Kael never sells out a crewmate.', "- Kael: Kaelan's ship is his.", '- kael: cannot swim.']
      .join('\n'),
  )
})

Deno.test('factsOf states only what the Scenario states, and who plays whom when asked', () => {
  const s = parseScenario('tavern', valid)
  const facts = factsOf(s)
  assertStringIncludes(facts, 'place: A small tavern by the harbour.')
  assertStringIncludes(facts, 'goal: find who sent the letter.')
  assertEquals(facts.includes('style'), false)
  // The music is for the music alone, not the Character or the pictures.
  assertEquals(facts.includes('fiddle'), false)
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
    // A file that doesn't give its dates has the file's own.
    const { mtime } = await Deno.stat(join(dir, 'good.md'))
    assertEquals(scenarios[0].modified, mtime!.toISOString())
  } finally {
    await Deno.remove(dir, { recursive: true })
  }
})

Deno.test('dirScenarioLibrary treats a missing directory as empty', async () => {
  const { scenarios, errors } = await dirScenarioLibrary('/nonexistent/scenarios').list()
  assertEquals(scenarios, [])
  assertEquals(errors, [])
})

Deno.test('seedScenarios copies the examples only where there is no folder yet', async () => {
  const root = await Deno.makeTempDir()
  try {
    const examples = join(root, 'examples')
    const mine = join(root, 'scenarios')
    await Deno.mkdir(examples)
    await Deno.writeTextFile(join(examples, 'tavern.md'), valid)
    await Deno.writeTextFile(join(examples, 'notes.txt'), 'not a Scenario')
    assertEquals(await seedScenarios(mine, examples), ['tavern.md'])
    // Emptied, it stays empty: a deleted example stays deleted.
    await Deno.remove(join(mine, 'tavern.md'))
    assertEquals(await seedScenarios(mine, examples), [])
    assertEquals((await Array.fromAsync(Deno.readDir(mine))).length, 0)
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})
