import type { ChatMessage } from '../text/chat.ts'
import { loadPrompt } from '../promptFiles.ts'
import {
  briefScenario,
  type Person,
  PERSON_FIELDS,
  personId,
  type Scenario,
  scenarioMarkdown,
} from '../scenario.ts'

/**
 * Expand, run as the Scenario page opens (ADR 0032): sparse on purpose. It sorts a typed Brief into
 * the Scenario's parts, names the People and who plays whom, and offers the other blanks as
 * suggestions, filling none. A Scenario's stated parts are kept whatever the model says.
 */

/** What Expand starts from: a Scenario picked on Home, or a typed Brief. */
export type ExpandFrom = { scenario: Scenario } | { brief: string }

/**
 * A suggestion for a blank part, for the player to take or leave. `field` names it from the
 * Scenario's type: `place`, `truths`, `people.<id>.goal`.
 */
export interface Suggestion {
  field: string
  text: string
}

export interface Expansion {
  scenario: Scenario
  suggestions: Suggestion[]
}

/** A Scenario's own parts that can be blank and suggested. */
const STORY_FIELDS = ['place', 'time', 'style', 'music', 'truths'] as const
const PERSON_PARTS = [...PERSON_FIELDS, 'truths'] as const
const MAX_SUGGESTIONS = 10

export async function expandMessages(from: ExpandFrom): Promise<ChatMessage[]> {
  const fromBrief = 'brief' in from
  const suggest = await loadPrompt('scenario/expand-suggest')
  return [
    {
      role: 'system',
      content: await loadPrompt(`scenario/expand-${fromBrief ? 'brief' : 'scenario'}`, { suggest }),
    },
    {
      role: 'user',
      content: await loadPrompt(
        'scenario/expand-request',
        {
          ...(fromBrief
            ? { what: 'Brief', text: from.brief }
            : { what: 'Scenario', text: scenarioMarkdown(from.scenario) }),
          // The schema's parts, in order, so the model knows the suggestions are still to come.
          parts: Object.keys(expandSchema(from).properties).filter((k) => k !== 'suggestions')
            .map((k) => `"${k}"`).join(', '),
        },
      ),
    },
  ]
}

const text = { type: 'string' }
const texts = { type: 'array', items: text }
const object = (properties: Record<string, object>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
})
const name = { type: 'string', description: 'a first name, or first and last; never a title' }

/** Whether Expand names the People: from a Brief, or a Scenario that lists none. */
const namesPeople = (from: ExpandFrom) => 'brief' in from || from.scenario.people.length === 0

/**
 * What Expand replies with: from a Brief, every part; from a Scenario, only what's kept of it
 * (who plays whom, and its People's names if it lists none), so the model doesn't copy out the
 * rest.
 */
export const expandSchema = (from: ExpandFrom) =>
  object({
    ...('brief' in from && { title: text, description: text }),
    // The People and who plays whom before the Opening, so it can name them: written after it,
    // the Opening named everyone in 2 Briefs in 9 ("a lighthouse keeper", "the player").
    ...(namesPeople(from) && {
      people: {
        type: 'array',
        items: 'brief' in from
          ? object({
            name,
            ...Object.fromEntries(PERSON_FIELDS.map((f) => [f, text])),
            truths: texts,
          })
          : object({ name }),
      },
    }),
    player: text,
    character: text,
    ...('brief' in from && {
      opening: text,
      place: text,
      time: text,
      style: text,
      music: text,
      truths: texts,
    }),
    suggestions: {
      type: 'array',
      items: object({
        person: text,
        field: { type: 'string', enum: [...new Set([...STORY_FIELDS, ...PERSON_PARTS])] },
        text,
      }),
    },
  })

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => typeof v === 'string' ? v.trim() : ''
const strs = (v: unknown) => Array.isArray(v) ? v.map(str).filter(Boolean) : []

/** The People the model names, each once, with what it wrote of them. */
function proposedPeople(value: unknown): Person[] {
  const seen = new Set<string>()
  const people: Person[] = []
  for (const raw of Array.isArray(value) ? value : []) {
    const p = isRecord(raw) ? raw : {}
    const name = str(p.name)
    const id = personId(name)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const person: Person = { id, name, ...blankPerson, truths: strs(p.truths) }
    for (const f of PERSON_FIELDS) person[f] = str(p[f])
    people.push(person)
  }
  return people
}

const blankPerson = Object.fromEntries(PERSON_FIELDS.map((f) => [f, ''])) as Record<
  (typeof PERSON_FIELDS)[number],
  string
>

/**
 * The Scenario the page shows, from what Expand started from and what the model replied: from a
 * Brief, what the model sorted out of it (the Brief itself standing in for a missing title or
 * Opening); from a Scenario, the Scenario as stated, with who plays whom if it doesn't say, and
 * its People by name if it lists none. Then the suggestions for
 * what's still blank, one per part.
 */
export function expanded(from: ExpandFrom, value: unknown): Expansion {
  const o = isRecord(value) ? value : {}
  const proposed = proposedPeople(o.people)
  let scenario: Scenario
  if ('brief' in from) {
    const fallback = briefScenario(from.brief)
    scenario = {
      ...fallback,
      title: str(o.title) || fallback.title,
      description: str(o.description) || fallback.description,
      opening: str(o.opening) || fallback.opening,
      place: str(o.place),
      time: str(o.time),
      style: str(o.style),
      music: str(o.music),
      truths: strs(o.truths),
      people: proposed,
    }
  } else {
    // A Scenario that lists its People has said who's in it (a model asked for anyone else in the
    // scene added people only mentioned, 2026-11-03); one that lists none gets them named.
    const stated = from.scenario
    const named = proposed.map(({ id, name }) => ({ id, name, ...blankPerson, truths: [] }))
    scenario = namesPeople(from) ? { ...stated, people: named } : stated
  }

  // By name, not id: a Person added or renamed on the page keeps an id that isn't their name's.
  const byName = (name: unknown) => {
    const key = personId(str(name))
    return key ? scenario.people.find((p) => personId(p.name) === key) : undefined
  }
  const player = scenario.player ?? byName(o.player)?.id
  const character = scenario.character ?? byName(o.character)?.id
  if (player) scenario.player = player
  if (character && character !== player) scenario.character = character

  const suggestions: Suggestion[] = []
  for (const raw of Array.isArray(o.suggestions) ? o.suggestions : []) {
    const s = isRecord(raw) ? raw : {}
    const field = str(s.field)
    const suggestion = str(s.text)
    if (!suggestion) continue
    let path: string
    let blank: boolean
    if (str(s.person)) {
      const person = byName(s.person)
      if (!person || !(PERSON_PARTS as readonly string[]).includes(field)) continue
      const part = person[field as (typeof PERSON_PARTS)[number]]
      path = `people.${person.id}.${field}`
      blank = part.length === 0
    } else {
      if (!(STORY_FIELDS as readonly string[]).includes(field)) continue
      path = field
      blank = scenario[field as (typeof STORY_FIELDS)[number]].length === 0
    }
    if (!blank || suggestions.some((x) => x.field === path)) continue
    suggestions.push({ field: path, text: suggestion })
    if (suggestions.length === MAX_SUGGESTIONS) break
  }
  return { scenario, suggestions }
}
