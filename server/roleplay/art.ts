/**
 * The Art Agent: turns a Roleplay Frame into an Image Prompt, the same shape as a Storyboard
 * Frame's: identities, the Frame's seven sentences, then style (ADR 0012). The identities are the
 * Look's sentences for the people the picture shows, so someone who has left the scene isn't
 * drawn into it, and someone the story brings in joins the Look, to look the same next time.
 * Its prompts are `prompts/roleplay/art-*.md`.
 */
import { stringify } from '@std/yaml'
import { crossedLimit, limitsEnabled } from '../limits.ts'
import { composePrompt, matchShown, shownPeople } from '../look.ts'
import type { ChatMessage } from '../text/chat.ts'
import { loadPrompt } from '../promptFiles.ts'
import type { Scenario } from '../scenario.ts'
import { frameSchema, lookSchema, parseLook } from '../textModel.ts'
import type { Look, Person } from '../session.ts'
import type { RoleplayFrame, RoleplaySession } from './types.ts'

/**
 * Who a picture adds and shows, after its sentences: anyone in it the Look doesn't have yet (a
 * name and an identity), then the names of everyone in it, the most prominent first.
 *
 * These come last: put first, gemma4 wrote the yes/no answers that came before them and then only
 * blank lines until its token cap, 6 times in 6; last, 0 in 6. Nor is there a `maxLength` per
 * field, which did the same; `trimFields` keeps the sentences short instead.
 */
const whoSchema = {
  newcomers: lookSchema.properties.people,
  shown: {
    type: 'array',
    items: { type: 'string' },
    description: 'the names of everyone in the picture, most prominent first',
  },
}

/** A Frame's seven sentences, then who the picture adds and shows. */
export const artFrameSchema = {
  type: 'object',
  properties: { ...frameSchema.properties, ...whoSchema },
  required: [...frameSchema.required, 'newcomers', 'shown'],
}

/**
 * How the Art Agent writes a picture: seven sentences (prose), or short tags per aspect. Prose is
 * the default and did better on every Image Model tried (docs/models.md): tags can't say who does
 * what to whom.
 */
export type ArtStyle = 'prose' | 'tags'
export const ART_STYLES: readonly ArtStyle[] = ['prose', 'tags']

const ASPECTS = ['pose', 'expression', 'camera', 'clothing', 'environment', 'lighting', 'color']

/** The same reply as `artFrameSchema`, with comma-separated tags in place of each sentence. */
export const artTagsSchema = {
  type: 'object',
  properties: {
    ...Object.fromEntries(
      ASPECTS.map((a) => [a, { type: 'string', description: `${a} tags, comma-separated` }]),
    ),
    ...whoSchema,
  },
  required: [...ASPECTS, 'newcomers', 'shown'],
}

/** A tags reply's aspects as one comma-separated list, in aspect order. */
export function joinTags(fields: Record<string, unknown>): string {
  const tags = ASPECTS
    .map((a) => String(fields[a] ?? '').trim().replace(/[.,;]+$/, ''))
    .filter(Boolean)
  if (!tags.length) throw new Error('The Text Model wrote no tags')
  return tags.join(', ')
}

/** Who a picture shows and adds, from the Art Agent's reply: names, and new people. */
export function parseWho(
  fields: Record<string, unknown>,
): { shown: string[]; newcomers: Person[] } {
  const shown = Array.isArray(fields.shown)
    ? fields.shown.filter((n): n is string => typeof n === 'string' && n.trim() !== '')
    : []
  // Read as a Look's people are: tidied, each with a name and an identity, no name twice.
  const newcomers = Array.isArray(fields.newcomers)
    ? parseLook({ people: fields.newcomers, style: '-' }).people
    : []
  return { shown, newcomers }
}

/** A Roleplay's Look: everyone the Cast and Brief name, then the art style. */
export const roleplayLookSchema = {
  type: 'object',
  properties: {
    people: lookSchema.properties.people,
    style: { type: 'string', description: 'the art style and medium' },
  },
  required: ['people', 'style'],
}

/** Whether a Roleplay has a Look of people (one from before this has none: it's written again). */
export const isLook = (look: unknown): look is Look =>
  Array.isArray((look as Look | null)?.people) && typeof (look as Look).style === 'string'

/** Reads a written Look; throws if it has no one or no style. */
export function parseRoleplayLook(value: unknown): Look {
  const look = parseLook(value)
  if (!look.people.length || !look.style) throw new Error('The Look needs its people and a style')
  return look
}

/**
 * An identity for several people at once ("two men, mid-20s…"): a Look holds one person per entry,
 * as each may be pictured alone. Told so, the Art Agent still once added a pair as one (2026-10-09).
 */
const isGroup = (identity: string) =>
  /^(two|three|four|five|several|some|a few|a group|a pair|a crowd|a gang|a band)\b/i
    .test(identity.trim())

/**
 * The Look with a picture's newcomers added: each whose name isn't in it yet, who is one person,
 * and whose identity crosses no Limit (anyone left out is described by the picture's own
 * sentences instead).
 */
export function withNewcomers(look: Look, newcomers: Person[]): Look {
  const people = [...look.people]
  for (const person of newcomers) {
    if (matchShown(people, [person.name]).length) continue
    if (isGroup(person.identity) || crossedLimit(person.identity)) continue
    people.push(person)
  }
  return people.length === look.people.length ? look : { ...look, people }
}

/** How long each of a picture's sentences may run, in characters. */
export const FIELD_LENGTH = 280

/**
 * Keeps each field to its whole sentences within `FIELD_LENGTH` characters, and always its first.
 * A long story gives the Art Agent a lot to say: left alone, Qwen3.8 wrote three or four sentences
 * per aspect for a busy Frame, and a long prompt dilutes, or is cut off by, the Image Model.
 */
export function trimFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => {
      if (typeof value !== 'string' || value.length <= FIELD_LENGTH) return [key, value]
      const sentences = value.match(/[^.!?]+[.!?]+["')\]]?\s*/g) ?? [value]
      let kept = sentences[0]
      for (const next of sentences.slice(1)) {
        if ((kept + next).trim().length > FIELD_LENGTH) break
        kept += next
      }
      return [key, kept.trim()]
    }),
  )
}

const block = (value: object) => stringify(value, { lineWidth: 100 }).trim()

const artLimits = () =>
  loadPrompt(limitsEnabled() ? 'roleplay/art-limits' : 'roleplay/art-limits-adults-only')

/**
 * The story up to and including Frame `upTo`, as the Art Agent reads it: each Message and what the
 * Character did and said. Thoughts are left out: a picture can't show them.
 */
export function storyText(session: RoleplaySession, upTo: number): string {
  const character = session.cast?.character.name ?? 'The Character'
  const persona = session.cast?.persona.name ?? 'The player'
  return session.frames.slice(0, upTo + 1).map((f) => {
    const lines = [`Frame ${f.index}`]
    if (f.message !== null) lines.push(`${persona}: ${f.message}`)
    const said = f.reply.dialogue ? ` "${f.reply.dialogue}"` : ''
    lines.push(`${character}: ${f.reply.actions}${said}`)
    return lines.join('\n')
  }).join('\n\n')
}

/**
 * What each person wore when last pictured before Frame `index`: the clothing sentence of the
 * latest earlier picture showing them, one line per picture ("Frame 12, Kael and Elara Vance:
 * …"); '' if no one has been pictured yet. The Art Agent copies it forward and changes only what
 * the story changed since, so clothes (and marks such as blood) don't come and go between pictures.
 */
export function lastWorn(session: RoleplaySession, index: number): string {
  const lastFrame = new Map<string, RoleplayFrame>()
  for (const f of session.frames.slice(0, index)) {
    if (!f.clothing) continue
    for (const name of f.shown ?? []) lastFrame.set(name, f)
  }
  const byFrame = new Map<RoleplayFrame, string[]>()
  for (const [name, f] of lastFrame) byFrame.set(f, [...(byFrame.get(f) ?? []), name])
  return [...byFrame].sort(([a], [b]) => a.index - b.index)
    .map(([f, names]) => `- Frame ${f.index}, ${names.join(' and ')}: ${f.clothing}`)
    .join('\n')
}

/** The call that writes a Roleplay's Look, from its Cast and Brief. */
export async function artLookMessages(
  session: RoleplaySession,
  scenario: Scenario,
): Promise<ChatMessage[]> {
  return [
    {
      role: 'system',
      content: await loadPrompt('roleplay/art-look', {
        ...session.cast!,
        identity: await loadPrompt('shared/identity'),
        limits: await artLimits(),
      }),
    },
    {
      role: 'user',
      content: await loadPrompt('roleplay/art-look-request', {
        brief: scenario.openingPrompt,
        cast: block(session.cast!),
      }),
    },
  ]
}

/** The call that writes Frame `index`'s seven sentences, reading the story up to it. */
export async function artFrameMessages(
  session: RoleplaySession,
  index: number,
  style: ArtStyle = 'prose',
): Promise<ChatMessage[]> {
  return [
    {
      role: 'system',
      content: await loadPrompt(
        style === 'tags' ? 'roleplay/art-frame-tags' : 'roleplay/art-frame',
        {
          ...session.cast!,
          placeAlone: await loadPrompt('shared/place-alone'),
          who: await loadPrompt('roleplay/art-who', {
            identity: await loadPrompt('shared/identity'),
            shown: await loadPrompt('shared/shown'),
          }),
          limits: await artLimits(),
        },
      ),
    },
    {
      role: 'user',
      content: await loadPrompt('roleplay/art-frame-request', {
        look: block(session.look!),
        story: storyText(session, index),
        worn: lastWorn(session, index) || '(no one has been pictured yet)',
        frame: index,
      }),
    },
  ]
}

/**
 * While the Limits are on, a picture showing two or more people must say what each wears. Told to
 * keep within the Limits, the Art Agent sometimes leaves an undressed person's clothing out
 * instead of dressing them, and an image model left to guess may not dress them either. A person
 * counts as named by any word of their name ("the barkeep" by "barkeep"), or its plural, as
 * people dressed together are ("the first man" by "the two men wear…").
 */
export function undressed(
  people: Person[],
  clothing: string | undefined,
): string | undefined {
  if (!limitsEnabled() || people.length < 2 || clothing === undefined) return undefined
  const text = clothing.toLowerCase()
  const plural = (w: string) => w.endsWith('man') ? `${w.slice(0, -3)}men` : `${w}s`
  const named = (name: string) =>
    name.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && w !== 'the')
      .some((w) => text.includes(w) || text.includes(plural(w)))
  const missing = people.some((p) => !named(p.name))
  return missing ? "everyone shown must be dressed (name each person's clothes)" : undefined
}

/**
 * A Frame with its picture's sentences, its Image Prompt, and whether it crosses a Limit. A
 * rendered picture whose Image Prompt changes is marked stale until rendered again.
 */
export function pictured(
  frame: RoleplayFrame,
  look: Look,
  body: string,
  shown: string[] = frame.shown ?? [],
  clothing = frame.clothing,
): RoleplayFrame {
  const { blocked: _, stale: __, ...rest } = frame
  shown = matchShown(look.people, shown)
  const prompt = composePrompt(look, body, shown)
  const blocked = crossedLimit(prompt)?.message ?? undressed(shownPeople(look, shown), clothing)
  const stale = !!frame.image && (frame.stale || prompt !== frame.prompt)
  return {
    ...rest,
    body,
    shown,
    ...(clothing !== undefined ? { clothing } : {}),
    prompt,
    ...(blocked ? { blocked } : {}),
    ...(stale ? { stale } : {}),
  }
}
