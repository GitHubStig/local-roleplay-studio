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

/** Trimmed text that ends a sentence. */
export const asSentences = (text: string) => {
  const t = text.trim()
  return !t || /[.!?]["')\]]?$/.test(t) ? t : `${t}.`
}
