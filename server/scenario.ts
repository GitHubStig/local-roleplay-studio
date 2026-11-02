import { extract } from '@std/front-matter/yaml'
import { stringify } from '@std/yaml'
import { basename, extname, fromFileUrl, join } from '@std/path'

/**
 * A Scenario: a story a Session starts from (ADR 0032). What it states holds; what it leaves blank
 * ('' or empty) is the Text Model's to invent. Saved as Markdown (`example-scenarios/*.md`,
 * `docs/scenarios.md`): `scenarioMarkdown` writes it, `parseScenario` reads it back.
 */
export interface Scenario {
  /** File name without extension, e.g. `tavern`. */
  id: string
  title: string
  description: string
  /** The situation when the story starts; the only part a Scenario must have. */
  opening: string
  place: string
  /** The time of day, and the weather. */
  time: string
  /** The art style every picture is made in; '' for the Look to pick one. */
  style: string
  /** What holds about the story whatever anyone does. */
  truths: string[]
  people: Person[]
  /** The id of the Person the player plays by default in a Roleplay. */
  player?: string
  /** The id of the Person the Text Model plays by default in a Roleplay. */
  character?: string
}

/** Anyone the story treats as someone: a human, an alien, a monster, a talking car. */
export interface Person {
  /** From the name (`personId`): what the Scenario's `player` and `character` name. */
  id: string
  name: string
  /** Permanent features (age, build, skin, hair, face), in no art style. */
  looks: string
  /** What they have on at the start. */
  wears: string
  personality: string
  /** Their way of speaking. */
  speaks: string
  background: string
  /** What they want in this story, and what drives them. */
  goal: string
  /** What holds about them whatever anyone does, whoever plays them. */
  truths: string[]
}

export interface ScenarioSummary {
  id: string
  title: string
  description: string
}

export interface ScenarioLoadError {
  file: string
  message: string
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A Person's id, from their name: `Old Tom` → `old-tom`. */
export const personId = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')

/** The prose sections, in the order they're written. */
const PROSE = ['opening', 'place', 'time', 'style'] as const
const SECTIONS = [...PROSE, 'truths', 'people']

/** A Person's fields as written (`- Looks: …`), in order. */
const PERSON_FIELDS = ['looks', 'wears', 'personality', 'speaks', 'background', 'goal'] as const
const LABELS: Record<(typeof PERSON_FIELDS)[number] | 'truths', string> = {
  looks: 'Looks',
  wears: 'Wears',
  personality: 'Personality',
  speaks: 'Speaks',
  background: 'Background',
  goal: 'Goal',
  truths: 'Truths',
}

/** Splits text into its `#`-level headings' sections, keyed by heading, in order. */
function split(text: string, level: string): { heading: string; text: string }[] {
  const result: { heading: string; text: string }[] = []
  const pattern = new RegExp(`^${level}\\s+(.+?)\\s*$`)
  for (const line of text.split('\n')) {
    const heading = line.match(pattern)
    if (heading) result.push({ heading: heading[1], text: '' })
    else if (result.length) result.at(-1)!.text += line + '\n'
  }
  return result.map((s) => ({ ...s, text: s.text.trim() }))
}

/** A Markdown list's items, a line not starting with `- ` joining the item before it. */
function items(text: string): string[] {
  const result: string[] = []
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith('- ')) result.push(line.slice(2).trim())
    else if (result.length) result[result.length - 1] += ' ' + line
    else result.push(line)
  }
  return result
}

/** A Person's section: `- Label: text` lines, with `- Truths:` followed by an indented list. */
function parsePerson(name: string, text: string, issues: string[]): Person {
  const person: Person = {
    id: personId(name),
    name,
    looks: '',
    wears: '',
    personality: '',
    speaks: '',
    background: '',
    goal: '',
    truths: [],
  }
  const byLabel = new Map(
    Object.entries(LABELS).map(([field, label]) => [label.toLowerCase(), field]),
  )
  let field: string | undefined
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue
    const top = raw.match(/^- ([^:]+):\s*(.*)$/)
    if (top) {
      field = byLabel.get(top[1].trim().toLowerCase())
      if (!field) {
        issues.push(
          `${name}: unknown line "${top[1]}"; a Person has ${Object.values(LABELS).join(', ')}`,
        )
      } else if (field === 'truths') {
        if (top[2]) person.truths.push(top[2])
      } else {
        person[field as (typeof PERSON_FIELDS)[number]] = top[2]
      }
      continue
    }
    const line = raw.trim()
    if (field === 'truths') {
      if (line.startsWith('- ')) person.truths.push(line.slice(2).trim())
      else if (person.truths.length) person.truths[person.truths.length - 1] += ' ' + line
    } else if (field) {
      const key = field as (typeof PERSON_FIELDS)[number]
      person[key] = person[key] ? `${person[key]} ${line}` : line
    } else {
      issues.push(`${name}: "${line}" isn't under a line such as "- Looks:"`)
    }
  }
  return person
}

/** Parses a Scenario file's text; throws an Error listing every problem found. */
export function parseScenario(id: string, text: string): Scenario {
  let attrs: unknown
  let body: string
  try {
    ;({ attrs, body } = extract(text))
  } catch (err) {
    throw new Error(`frontmatter: ${(err as Error).message}`)
  }
  if (!isRecord(attrs)) throw new Error('frontmatter must be a YAML mapping')

  const issues: string[] = []
  const str = (key: string, required: boolean) => {
    const v = attrs[key]
    if (v === undefined && !required) return ''
    if (typeof v !== 'string' || v.trim() === '') issues.push(`${key} must be a non-empty string`)
    return typeof v === 'string' ? v.trim() : ''
  }
  const title = str('title', true)
  const description = str('description', true)
  const player = str('player', false)
  const character = str('character', false)
  for (const key of Object.keys(attrs)) {
    if (!['title', 'description', 'player', 'character'].includes(key)) {
      issues.push(`unknown frontmatter "${key}"; it has title, description, player and character`)
    }
  }

  const sections = new Map<string, string>()
  for (const { heading, text } of split(body, '##')) {
    const key = heading.toLowerCase()
    if (!SECTIONS.includes(key)) {
      issues.push(`unknown section "${heading}"; the sections are ${SECTIONS.join(', ')}`)
    } else if (sections.has(key)) issues.push(`two "${heading}" sections`)
    else sections.set(key, text)
  }
  // Lines join into paragraphs; a blank line between paragraphs is kept.
  const prose = (key: string) =>
    (sections.get(key) ?? '').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .join('\n\n')
  const opening = prose('opening')
  if (!opening) issues.push('body needs a non-empty "## Opening" section')

  const people = split(sections.get('people') ?? '', '###')
    .map(({ heading, text }) => parsePerson(heading, text, issues))
  const ids = new Set<string>()
  for (const p of people) {
    if (!p.id) issues.push(`"${p.name}" needs a name with a letter or a number`)
    else if (ids.has(p.id)) issues.push(`two people are called "${p.name}"`)
    ids.add(p.id)
  }
  const role = (key: string, name: string) => {
    if (!name) return undefined
    if (!ids.has(personId(name))) issues.push(`${key} "${name}" isn't one of the People`)
    return personId(name)
  }
  const scenario: Scenario = {
    id,
    title,
    description,
    opening,
    place: prose('place'),
    time: prose('time'),
    style: prose('style'),
    truths: items(sections.get('truths') ?? ''),
    people,
    ...(player && { player: role('player', player) }),
    ...(character && { character: role('character', character) }),
  }
  if (scenario.player && scenario.player === scenario.character) {
    issues.push('the player and the character must be different People')
  }
  if (issues.length > 0) throw new Error(issues.join('; '))
  return scenario
}

/** A Scenario as its file: `parseScenario` reads back what this writes. */
export function scenarioMarkdown(s: Scenario): string {
  const nameOf = (id?: string) => s.people.find((p) => p.id === id)?.name
  const front: Record<string, string> = { title: s.title, description: s.description }
  if (nameOf(s.player)) front.player = nameOf(s.player)!
  if (nameOf(s.character)) front.character = nameOf(s.character)!
  const list = (truths: string[], indent = '') => truths.map((t) => `${indent}- ${t}`).join('\n')
  const parts = [`---\n${stringify(front, { lineWidth: -1 }).trim()}\n---`]
  for (const key of PROSE) {
    if (s[key]) parts.push(`## ${key[0].toUpperCase()}${key.slice(1)}\n\n${s[key]}`)
  }
  if (s.truths.length) parts.push(`## Truths\n\n${list(s.truths)}`)
  if (s.people.length) {
    parts.push('## People')
    for (const p of s.people) {
      const lines = PERSON_FIELDS.filter((f) => p[f]).map((f) => `- ${LABELS[f]}: ${p[f]}`)
      if (p.truths.length) lines.push(`- Truths:\n${list(p.truths, '  ')}`)
      parts.push(`### ${p.name}${lines.length ? `\n\n${lines.join('\n')}` : ''}`)
    }
  }
  return parts.join('\n\n') + '\n'
}

/** Without what's blank: the empty strings and lists. */
const stated = (o: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => Array.isArray(v) ? v.length : v),
  )

/**
 * The Truths, for the Text Model: the story's, then each Person's, by name. Empty for none.
 */
export function truthsOf(s: Scenario): string {
  return [
    ...s.truths,
    ...s.people.flatMap((p) => p.truths.map((t) => `${p.name}: ${t}`)),
  ].map((t) => `- ${t}`).join('\n')
}

/**
 * What a Scenario states besides its Opening and Truths, as a YAML block for the Text Model:
 * the place, time and style, and each Person but their Truths. Empty when it states none.
 */
export function factsOf(s: Scenario, roles = false): string {
  const name = (id?: string) => s.people.find((p) => p.id === id)?.name
  const people = Object.fromEntries(
    s.people.map(({ id: _, name, truths: __, ...rest }) => [name, stated(rest)]),
  )
  const facts = stated({
    place: s.place,
    time: s.time,
    style: s.style,
    people: s.people.length ? people : '',
    ...(roles && { 'the player plays': name(s.player), 'the Text Model plays': name(s.character) }),
  })
  return Object.keys(facts).length ? stringify(facts, { lineWidth: -1 }).trim() : ''
}

/**
 * A typed Brief standing in for a Scenario: the Brief itself as the Opening, the rest blank. Lets
 * the engine treat both starting points the same way.
 */
export function briefScenario(brief: string): Scenario {
  return {
    id: '',
    title: brief.length > 60 ? `${brief.slice(0, 57).trimEnd()}…` : brief,
    description: brief,
    opening: brief,
    place: '',
    time: '',
    style: '',
    truths: [],
    people: [],
  }
}

export interface ScenarioLibrary {
  /** Every valid Scenario, plus a report of the files that failed to parse. */
  list(): Promise<{ scenarios: Scenario[]; errors: ScenarioLoadError[] }>
  get(id: string): Promise<Scenario | undefined>
}

/** Reads Scenarios fresh from `dir` on every call, so edits apply without a restart. */
export function dirScenarioLibrary(dir: string | URL): ScenarioLibrary {
  const root = dir instanceof URL ? fromFileUrl(dir) : dir

  async function list() {
    const scenarios: Scenario[] = []
    const errors: ScenarioLoadError[] = []
    let entries: Deno.DirEntry[]
    try {
      entries = await Array.fromAsync(Deno.readDir(root))
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return { scenarios, errors }
      throw err
    }
    const files = entries
      .filter((e) => e.isFile && extname(e.name) === '.md')
      .map((e) => e.name)
      .sort()
    for (const file of files) {
      try {
        const text = await Deno.readTextFile(join(root, file))
        scenarios.push(parseScenario(basename(file, '.md'), text))
      } catch (err) {
        errors.push({ file, message: (err as Error).message })
      }
    }
    return { scenarios, errors }
  }

  return {
    list,
    async get(id) {
      return (await list()).scenarios.find((s) => s.id === id)
    },
  }
}

/**
 * Several libraries read as one, the first's Scenarios first; a later one's with an id already
 * taken are left out, so the player's own Scenario stands in for an example of the same name.
 */
export function combinedScenarioLibrary(...libraries: ScenarioLibrary[]): ScenarioLibrary {
  async function list() {
    const lists = await Promise.all(libraries.map((l) => l.list()))
    const ids = new Set<string>()
    const scenarios = lists.flatMap((l) => l.scenarios).filter((s) =>
      !ids.has(s.id) && ids.add(s.id)
    )
    return { scenarios, errors: lists.flatMap((l) => l.errors) }
  }
  return {
    list,
    async get(id) {
      return (await list()).scenarios.find((s) => s.id === id)
    },
  }
}

export const summarise = ({ id, title, description }: Scenario): ScenarioSummary => ({
  id,
  title,
  description,
})
