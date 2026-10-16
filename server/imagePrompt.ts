/**
 * The nine sentences of an Image Prompt, in order. Each sentence covers one aspect only, so
 * every detail is said once, in one place, and changing an aspect means rewriting one sentence.
 */
export const PROMPT_ORDER = [
  { aspect: 'subject and identity', covers: 'who they are: age, build, skin, hair, face' },
  { aspect: 'pose and limbs', covers: 'body position, limbs and hands' },
  { aspect: 'expression', covers: 'facial expression and where they look' },
  { aspect: 'camera angle and framing', covers: 'angle, lens and how much is in frame' },
  { aspect: 'clothing', covers: 'every garment and accessory' },
  { aspect: 'environment', covers: 'the location, backdrop and props' },
  { aspect: 'lighting', covers: 'the light sources, their direction and quality' },
  { aspect: 'color', covers: 'the palette and grading' },
  { aspect: 'art style and medium', covers: 'photograph, painting, render… and its style' },
] as const

/**
 * The whole state of a Session at one Frame: one paragraph of nine sentences, one per aspect of
 * `PROMPT_ORDER`, details within a sentence separated by commas or semicolons.
 */
export type ImagePrompt = string

/**
 * An Image Prompt from its parts written apart (Storyboard and Roleplay pictures): the identities
 * of who it shows, the picture's own sentences, then the art style. Each part ends as a sentence,
 * so they never run together; an empty one (a picture of no one) is left out.
 */
export const joinPrompt = (subject: string, body: string, style: string): ImagePrompt =>
  [subject, body, style].map(asSentences).filter(Boolean).join(' ')

/**
 * The sentences of a paragraph, in order. One ends at a full stop, whatever follows: a model may
 * start the next in lower case ("the traveller sits"; docs/bench/two-people).
 */
export const sentences = (text: string): string[] =>
  text.trim().split(/(?<=[.!?])\s+/).filter(Boolean)

/** An Image Prompt's first sentence, the subject: who is in the picture. */
export const subjectSentence = (prompt: ImagePrompt): string => sentences(prompt)[0] ?? ''

/**
 * Words that start no one's part: more about the person before ("…; her face is refined"), or
 * a picture of no one ("No one is in the picture.", a Chain made from a Storyboard).
 */
const NOT_A_NAME = /^(?:she|he|they|it|her|his|their|its|no one|nobody)\b/i

/**
 * Each person's part of a subject sentence, by their name (lower case, without "the"): the sentence is
 * "Kael is …; the traveller is …", or a Storyboard's identities joined, "Kael, a …; the traveller,
 * a …" (a Chain made from one). The name is what comes before the first comma or "is", up to four
 * words; a part without one is left out, and so is one that goes on about the person before.
 */
export function subjectParts(prompt: ImagePrompt): Map<string, string> {
  const parts = new Map<string, string>()
  for (const part of subjectSentence(prompt).replace(/[.!?]$/, '').split(/;\s*/)) {
    // "<name> is …", or "<name>, a …" (the comma followed by "a", "an", "the" or a number): a part
    // like "lean and rigid, weathered skin" goes on describing the person before it.
    const name = part.trim().match(/^(?:and\s+)?(.+?)(?:,\s+(?=(?:an?|the)\s|\d)|\s+(?:is|are)\b)/i)
      ?.[1]
    if (name && name.split(/\s+/).length <= 4 && !NOT_A_NAME.test(name)) {
      // "the traveller" and "traveller" are one person.
      const key = name.toLowerCase().replace(/^(?:the|an?)\s+/, '')
      parts.set(key, part.trim().replace(/^and\s+/i, ''))
    }
  }
  return parts
}

/**
 * Everyone in the earlier Image Prompts who isn't in `current`'s, each as last described, the
 * latest gone first: one line a person, however long the Chain. A Chain's paragraph is all it
 * remembers, so someone who left the picture would otherwise come back described afresh, or not
 * at all (docs/bench/two-people).
 */
export function peopleAway(earlier: ImagePrompt[], current: ImagePrompt): string[] {
  const here = subjectParts(current)
  const last = new Map<string, string>()
  for (const prompt of earlier) {
    for (const [name, part] of subjectParts(prompt)) {
      // Moved to the end, so the latest seen comes last.
      last.delete(name)
      last.set(name, part)
    }
  }
  return [...last].filter(([name]) => !here.has(name)).map(([, part]) => part).toReversed()
}

/** Trimmed text that ends a sentence. */
export const asSentences = (text: string) => {
  const t = text.trim()
  return !t || /[.!?]["')\]]?$/.test(t) ? t : `${t}.`
}
