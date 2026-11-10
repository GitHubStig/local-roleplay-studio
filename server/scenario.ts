import { extract } from '@std/front-matter/yaml'
import { stringify } from '@std/yaml'
import { basename, extname, fromFileUrl, join } from '@std/path'
import type { Person, Scenario, ScenarioLoadError, ScenarioSummary } from '../shared/scenario.ts'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A Person's id, from their name: `Old Tom` → `old-tom`. */
export const personId = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')

/** The prose sections, in the order they're written. */
export const PROSE = ['opening', 'place', 'time', 'style', 'music'] as const
const SECTIONS = [...PROSE, 'truths', 'people']

/** A Person's fields as written (`- Looks: …`), in order. */
export const PERSON_FIELDS = [
  'looks',
  'wears',
  'personality',
  'speaks',
  'background',
  'goal',
] as const
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
  // YAML reads an unquoted timestamp as a date, a quoted one as text: either will do.
  const date = (key: string) => {
    const v = attrs[key]
    if (v === undefined) return undefined
    const at = v instanceof Date ? v : new Date(typeof v === 'string' ? v : NaN)
    if (Number.isNaN(at.getTime())) issues.push(`${key} must be a date, e.g. 2026-11-03T10:00:00Z`)
    else return at.toISOString()
  }
  const created = date('created')
  const modified = date('modified')
  const FRONT = ['title', 'description', 'player', 'character', 'created', 'modified']
  for (const key of Object.keys(attrs)) {
    if (!FRONT.includes(key)) {
      issues.push(`unknown frontmatter "${key}"; it has ${FRONT.join(', ')}`)
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
    music: prose('music'),
    truths: items(sections.get('truths') ?? ''),
    people,
    ...(player && { player: role('player', player) }),
    ...(character && { character: role('character', character) }),
    ...(created && { created }),
    ...(modified && { modified }),
  }
  if (scenario.player && scenario.player === scenario.character) {
    issues.push('the player and the character must be different People')
  }
  if (issues.length > 0) throw new Error(issues.join('; '))
  return scenario
}

/**
 * A Scenario as the Scenario page sends it, checked and tidied; throws an Error listing every
 * problem found. Its People keep the ids they were given, so renaming one keeps who plays whom.
 */
export function scenarioFrom(value: unknown): Scenario {
  const o = isRecord(value) ? value : {}
  const issues: string[] = []
  const text = (v: unknown, what: string) => {
    if (v === undefined) return ''
    if (typeof v !== 'string') issues.push(`${what} must be text`)
    return typeof v === 'string' ? v.trim() : ''
  }
  const list = (v: unknown, what: string) => {
    if (v === undefined) return []
    if (!Array.isArray(v) || !v.every((t) => typeof t === 'string')) {
      issues.push(`${what} must be a list of text`)
      return []
    }
    return v.map((t) => t.trim()).filter(Boolean)
  }
  if (o.people !== undefined && !Array.isArray(o.people)) issues.push('people must be a list')
  const people = (Array.isArray(o.people) ? o.people : []).map((raw, i): Person => {
    const p = isRecord(raw) ? raw : {}
    const name = text(p.name, `person ${i + 1}'s name`)
    const person: Person = {
      id: text(p.id, `${name}'s id`) || personId(name),
      name,
      looks: '',
      wears: '',
      personality: '',
      speaks: '',
      background: '',
      goal: '',
      truths: list(p.truths, `${name}'s Truths`),
    }
    for (const f of PERSON_FIELDS) person[f] = text(p[f], `${name}'s ${LABELS[f]}`)
    return person
  })
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const p of people) {
    if (!p.name) issues.push('every Person needs a name')
    else if (names.has(p.name.toLowerCase())) issues.push(`two people are called "${p.name}"`)
    if (ids.has(p.id)) issues.push(`two people have the id "${p.id}"`)
    names.add(p.name.toLowerCase())
    ids.add(p.id)
  }
  const role = (key: 'player' | 'character') => {
    const id = text(o[key], key)
    if (id && !ids.has(id)) issues.push(`the ${key} isn't one of the People`)
    return id || undefined
  }
  const player = role('player')
  const character = role('character')
  const scenario: Scenario = {
    id: text(o.id, 'id'),
    title: text(o.title, 'title'),
    description: text(o.description, 'description'),
    opening: text(o.opening, 'opening'),
    place: text(o.place, 'place'),
    time: text(o.time, 'time'),
    style: text(o.style, 'style'),
    music: text(o.music, 'music'),
    truths: list(o.truths, 'the Truths'),
    people,
    ...(player && { player }),
    ...(character && { character }),
  }
  if (!scenario.title) issues.push('it needs a title')
  if (!scenario.opening) issues.push('it needs an Opening')
  if (player && player === character) {
    issues.push('the player and the character must be different People')
  }
  if (issues.length > 0) throw new Error(issues.join('; '))
  return scenario
}

/** Everything a Scenario says, as one text, for the Limits to check. */
export const scenarioText = (s: Scenario): string =>
  [
    s.title,
    s.description,
    ...PROSE.map((key) => s[key]),
    ...s.truths,
    ...s.people.flatMap((p) => [p.name, ...PERSON_FIELDS.map((f) => p[f]), ...p.truths]),
  ].filter(Boolean).join('\n')

/** A Scenario as its file: `parseScenario` reads back what this writes. */
export function scenarioMarkdown(s: Scenario): string {
  const nameOf = (id?: string) => s.people.find((p) => p.id === id)?.name
  const front: Record<string, string> = { title: s.title, description: s.description }
  if (nameOf(s.player)) front.player = nameOf(s.player)!
  if (nameOf(s.character)) front.character = nameOf(s.character)!
  if (s.created) front.created = s.created
  if (s.modified) front.modified = s.modified
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
 * The Truths: the story's, then each Person's, after their name ("Kael: He never…"), unless the
 * Truth starts with it already ("Kael never…").
 */
export const truthList = (s: Scenario): string[] => [
  ...s.truths,
  ...s.people.flatMap((p) => p.truths.map((t) => namesThem(t, p.name) ? t : `${p.name}: ${t}`)),
]
/** Whether `truth` starts with `name`, as a whole word. */
const namesThem = (truth: string, name: string) =>
  truth.toLowerCase().startsWith(name.toLowerCase()) &&
  !/[\p{L}\p{N}]/u.test(truth.charAt(name.length))

/**
 * The People besides two (in a Roleplay, the Character and the Persona, by id or by name: the Cast
 * may give a fuller name, "Kael Thorne" for Kael), a line each: the name, then what the Scenario
 * says of them but their Truths, which are with the story's.
 */
export function othersOf(s: Scenario, ...besides: string[]): string[] {
  const left = besides.map(personId).filter(Boolean)
  const isOne = (p: Person) =>
    p.id === s.player || p.id === s.character ||
    left.some((name) => name === personId(p.name) || name.startsWith(`${personId(p.name)}-`))
  return s.people.filter((p) => !isOne(p)).map((p) => {
    const said = PERSON_FIELDS.map((f) => p[f]).filter(Boolean)
    return said.length ? `${p.name}: ${said.join(' ')}` : p.name
  })
}

/** The Truths as a Markdown list, for the Text Model; empty for none. */
export const truthsOf = (s: Scenario): string => truthList(s).map((t) => `- ${t}`).join('\n')

/**
 * What a Scenario states besides its Opening and Truths, as a YAML block for the Text Model:
 * the place, time and style, and each Person but their Truths. Empty when it states none. Not the
 * music, which is for the music alone, not the Character or the pictures.
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
    music: '',
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
        const scenario = parseScenario(basename(file, '.md'), text)
        // A file that doesn't say when it was made or changed (an example, one written by hand):
        // the file's own dates.
        if (!scenario.created || !scenario.modified) {
          const { birthtime, mtime } = await Deno.stat(join(root, file))
          scenario.created ??= (birthtime ?? mtime)?.toISOString()
          scenario.modified ??= mtime?.toISOString()
        }
        scenarios.push(scenario)
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

/** A Scenario's id as a file name: lower-case letters, digits and hyphens, so it stays in its folder. */
export const SCENARIO_ID = /^[a-z0-9][a-z0-9-]{0,79}$/

/** The player's Scenarios (`scenarios/`): listed on Home, and written by the Scenario page. */
export interface ScenarioFolder extends ScenarioLibrary {
  /** Whether a file has this id, valid or not. */
  has(id: string): Promise<boolean>
  /** Writes the Scenario as its file, in place of any of that id. */
  save(id: string, markdown: string): Promise<void>
  remove(id: string): Promise<void>
}

/** `dirScenarioLibrary`, writable: the folder is made on the first save. */
export function dirScenarioFolder(dir: string | URL): ScenarioFolder {
  const root = dir instanceof URL ? fromFileUrl(dir) : dir
  const path = (id: string) => {
    if (!SCENARIO_ID.test(id)) throw new Error(`"${id}" isn't a Scenario id`)
    return join(root, `${id}.md`)
  }
  return {
    ...dirScenarioLibrary(root),
    async has(id) {
      try {
        return (await Deno.stat(path(id))).isFile
      } catch {
        return false
      }
    },
    async save(id, markdown) {
      await Deno.mkdir(root, { recursive: true })
      // Whole or not at all: a half-written file would show on Home as broken.
      await Deno.writeTextFile(`${path(id)}.tmp`, markdown)
      await Deno.rename(`${path(id)}.tmp`, path(id))
    },
    remove: (id) => Deno.remove(path(id)),
  }
}

/**
 * Copies the example Scenarios (`from`, e.g. `example-scenarios/`) into the player's folder when
 * there's no such folder yet (a fresh install, or a new worktree, which has its own), so they're
 * the player's to keep, edit or delete. A folder that's there is left alone, emptied or not, so
 * deleted examples stay deleted; removing the folder brings them back. Returns the files copied.
 */
export async function seedScenarios(folder: string | URL, from: string | URL): Promise<string[]> {
  const path = (p: string | URL) => p instanceof URL ? fromFileUrl(p) : p
  const mdFiles = async (dir: string) => {
    try {
      return (await Array.fromAsync(Deno.readDir(dir)))
        .filter((e) => e.isFile && extname(e.name) === '.md').map((e) => e.name).sort()
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return []
      throw err
    }
  }
  try {
    await Deno.stat(path(folder))
    return []
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err
  }
  const files = await mdFiles(path(from))
  await Deno.mkdir(path(folder), { recursive: true })
  for (const file of files) await Deno.copyFile(join(path(from), file), join(path(folder), file))
  return files
}

export const summarise = (
  { id, title, description, created, modified }: Scenario,
  own = false,
): ScenarioSummary => ({ id, title, description, own, created, modified })
