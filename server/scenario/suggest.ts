import type { ChatMessage } from '../text/chat.ts'
import { loadPrompt } from '../promptFiles.ts'
import { type PERSON_FIELDS, scenarioMarkdown } from '../scenario.ts'
import type { Scenario } from '../../shared/scenario.ts'

/**
 * Suggest, on the Scenario page: one suggestion for one blank part, when the player asks for it
 * (Expand suggests only for the parts it thinks matter most). Asked again, it gives another.
 */

/** The story's parts that can be suggested, and what each is. */
const STORY_PARTS: Record<string, string> = {
  place: 'the Place: where the story starts',
  time: 'the Time: the time of day, and the weather',
  style: 'the Style: the art style every picture is made in',
  music: "the Music: what the story's music is like (its genre, instruments and mood)",
  truths: 'a Truth: something that holds in the story whatever anyone does or says',
}

/** A Person's parts that can be suggested, and what each is, for `name`. */
const PERSON_PARTS: Record<(typeof PERSON_FIELDS)[number] | 'truths', (name: string) => string> = {
  looks: (n) =>
    `${n}'s Looks: what doesn't change (age, build, skin, hair, face), with no clothing and no art style`,
  wears: (n) => `what ${n} Wears at the start`,
  personality: (n) => `${n}'s Personality: how they are`,
  speaks: (n) => `how ${n} Speaks: their way of speaking`,
  background: (n) => `${n}'s Background: who they are, and their past`,
  goal: (n) => `${n}'s Goal: what they want in this story, and what drives them`,
  truths: (n) => `a Truth about ${n}: something that holds about them whoever plays them`,
}

/**
 * What a field (`place`, `truths`, `people.<id>.goal`) is, in words for the Text Model; undefined
 * for a field the Scenario doesn't have.
 */
export function partOf(scenario: Scenario, field: string): string | undefined {
  if (Object.hasOwn(STORY_PARTS, field)) return STORY_PARTS[field]
  const [, id, part] = field.match(/^people\.([^.]+)\.([a-z]+)$/) ?? []
  const person = scenario.people.find((p) => p.id === id)
  if (!person || !Object.hasOwn(PERSON_PARTS, part)) return undefined
  return PERSON_PARTS[part as keyof typeof PERSON_PARTS](person.name)
}

/** What Suggest is asked: one part of a Scenario, with what the player typed there as notes. */
export interface SuggestRequest {
  scenario: Scenario
  field: string
  /** What the player typed in the part, to build on; '' for a new suggestion from the story alone. */
  notes: string
}

/**
 * The Scenario with `field` emptied, so a suggestion isn't anchored on what's there (the player's
 * own text goes as notes instead).
 */
export function withoutPart(scenario: Scenario, field: string): Scenario {
  if (Object.hasOwn(STORY_PARTS, field)) {
    return { ...scenario, [field]: field === 'truths' ? [] : '' }
  }
  const [, id, part] = field.match(/^people\.([^.]+)\.([a-z]+)$/) ?? []
  return {
    ...scenario,
    people: scenario.people.map((p) =>
      p.id === id ? { ...p, [part]: part === 'truths' ? [] : '' } : p
    ),
  }
}

export async function suggestMessages(
  { scenario, field, notes }: SuggestRequest,
): Promise<ChatMessage[]> {
  const what = partOf(scenario, field)!
  return [
    { role: 'system', content: await loadPrompt('scenario/suggest', { what }) },
    {
      role: 'user',
      content: await loadPrompt('scenario/suggest-request', {
        scenario: scenarioMarkdown(withoutPart(scenario, field)),
        what,
        notes: notes ? await loadPrompt('scenario/suggest-notes', { notes }) : '',
      }),
    },
  ]
}

/** The suggestion as written: one paragraph, without quotes or a label around it. */
export const cleanSuggestion = (text: string) =>
  text.replace(/\s+/g, ' ').trim().replace(/^[^:\s]{1,20}:\s+/, '').replace(/^"(.*)"$/, '$1')
    .trim()
