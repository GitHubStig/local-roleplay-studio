/**
 * A Frame's seven sentences and a Look, as the Text Model writes them: the reply's schema and its
 * parsers, shared by Storyboards and a Roleplay's Art Agent.
 */
import { PROMPT_ORDER } from './imagePrompt.ts'
import type { Look } from '../shared/session.ts'

/** The sentences a Storyboard Frame writes itself; the Look supplies the first and last. */
export const BODY_ASPECTS = PROMPT_ORDER.slice(1, 8).map((p) => p.aspect)

/**
 * A Frame's seven sentences as separate required fields in the reply, so the model can't skip
 * any (one model squeezed all seven into a single pose sentence). The engine joins them into the
 * Frame's one paragraph; only the reply is split.
 */
const BODY_FIELDS = [
  ['pose', 1],
  ['expression', 2],
  ['camera', 3],
  ['clothing', 4],
  ['environment', 5],
  ['lighting', 6],
  ['color', 7],
] as const

/** A Frame's seven sentences as required fields, one per aspect (Storyboards, Roleplay pictures). */
export const frameSchema = {
  type: 'object',
  properties: Object.fromEntries(
    BODY_FIELDS.map(([key, i]) => [
      key,
      {
        type: 'string',
        description: `one sentence: ${PROMPT_ORDER[i].aspect}: ${PROMPT_ORDER[i].covers}`,
      },
    ]),
  ),
  required: BODY_FIELDS.map(([key]) => key),
}

/** Makes one clean sentence of a field, ending in a full stop. */
const asSentence = (text: string) => {
  const t = plainSentences(text)
  return /[.!?]$/.test(t) ? t : `${t}.`
}

/**
 * A Look as the model writes it: each Subject's identity (sentence 1, for it) and the art style
 * Frames share. The model writes its Subjects as "people": asked for "subjects", Gemma 4 26B cast
 * places and props too ("the tavern", "the letter") and named fewer (2026-10-17).
 */
export const lookSchema = {
  type: 'object',
  properties: {
    people: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          identity: { type: 'string', description: 'subject and identity, starting with the name' },
        },
        required: ['name', 'identity'],
      },
    },
    style: { type: 'string', description: 'sentence 9, art style and medium' },
  },
  required: ['people', 'style'],
}

/**
 * One line of text. A line break the model wrote out as `\n` (escaped twice in its JSON, so it
 * arrives as a backslash and an "n") counts as one: Gemma 4 12B did so in three Frames of a
 * Storyboard on 2026-10-08, picking it up from the Frames before.
 */
export const oneParagraph = (text: string) =>
  text.replace(/\\[nrt]/g, ' ').trim().replace(/\s+/g, ' ')

/** Aspect labels a model sometimes writes into the text despite being told not to. */
const LABEL = new RegExp(
  // Only at the start of the text, a line or a sentence: "Her style: bold" is left alone.
  String.raw`(?<=^|[.!?\n])\s*[-•*]?\s*(?:\d+\.\s*)?(?:` +
    [
      'subject(?: and identity)?',
      'pose(?: and limbs)?',
      'expression',
      'camera(?: angle(?: and framing)?)?',
      'clothing',
      'environment',
      'lighting',
      'colou?r',
      '(?:art )?style(?: and medium)?',
    ].join('|') +
    String.raw`)\s*:\s*`,
  'gi',
)

/** Strips stray aspect labels, list markers and line breaks: the prompt is plain sentences. */
export const plainSentences = (text: string) =>
  oneParagraph(text.replace(/([.!?])-\s/g, '$1 ').replace(LABEL, ' '))

/** A Look as the model reads it: its Subjects as "people", as it writes them (`lookSchema`). */
export const lookForModel = (look: Look) => ({ people: look.subjects, style: look.style })

/**
 * A Look from the reply, its "people" the Look's Subjects. One without a name or identity, or
 * named twice, is left out.
 */
export function parseLook(value: unknown): Look {
  const v = value as { people?: unknown; style?: unknown } | null
  if (typeof v?.style !== 'string' || !v.style.trim() || !Array.isArray(v.people)) {
    throw new Error('Text Model reply has no complete Look')
  }
  const subjects = v.people.flatMap((p) => {
    const name = typeof p?.name === 'string' ? oneParagraph(p.name) : ''
    const identity = typeof p?.identity === 'string' ? oneParagraph(p.identity) : ''
    return name && identity ? [{ name, identity }] : []
  }).filter((p, i, all) =>
    all.findIndex((q) => q.name.toLowerCase() === p.name.toLowerCase()) === i
  )
  return { subjects, style: oneParagraph(v.style) }
}

/**
 * A field a model filled with "N/A", or only with "No people.", for want of anything to say about
 * a picture with no one in it: Gemma 4 26B did both in a 16-Frame Storyboard on 2026-10-08.
 */
const NOT_APPLICABLE =
  /^\W*(?:(?:n\/a|none|not applicable)\b|no (?:people|one|person|humans?|figures?)(?: (?:are |is )?(?:visible|present|shown|in (?:the )?(?:frame|picture|shot)))?\W*$)/i

/**
 * A Frame's seven sentences from the reply, joined into one paragraph. Accepts the seven fields,
 * or a plain `body` string.
 */
export function parseFrameBody(value: unknown): string {
  const v = (value ?? {}) as Record<string, unknown>
  if (typeof v.body === 'string' && v.body.trim()) return plainSentences(v.body)
  const missing = BODY_FIELDS.filter(([key]) =>
    typeof v[key] !== 'string' || !String(v[key]).trim()
  )
  if (missing.length > 0) {
    throw new Error(`A Frame in the reply is missing: ${missing.map(([key]) => key).join(', ')}`)
  }
  return BODY_FIELDS
    .map(([key]) => String(v[key]))
    .filter((text) => !NOT_APPLICABLE.test(text))
    .map(asSentence)
    .join(' ')
}
