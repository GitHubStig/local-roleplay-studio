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

/** The sentences of a paragraph, in order. */
export const sentences = (text: string): string[] =>
  text.trim().split(/(?<=[.!?])\s+(?=[A-Z"'])/).filter(Boolean)

/** An Image Prompt's first sentence, the subject: who is in the picture. */
export const subjectSentence = (prompt: ImagePrompt): string => sentences(prompt)[0] ?? ''

/**
 * The subject sentences of earlier Image Prompts that aren't `current`'s, the latest first, each
 * once, at most `max`: who has been in the picture before, as described then. A Chain's paragraph
 * is all it remembers, so someone who left it would otherwise come back described afresh.
 */
export function earlierSubjects(earlier: ImagePrompt[], current: ImagePrompt, max = 3): string[] {
  const now = subjectSentence(current)
  const seen = new Set([now])
  const out: string[] = []
  for (const prompt of earlier.toReversed()) {
    const subject = subjectSentence(prompt)
    if (!subject || seen.has(subject)) continue
    seen.add(subject)
    out.push(subject)
    if (out.length === max) break
  }
  return out
}

/** Trimmed text that ends a sentence. */
export const asSentences = (text: string) => {
  const t = text.trim()
  return !t || /[.!?]["')\]]?$/.test(t) ? t : `${t}.`
}
