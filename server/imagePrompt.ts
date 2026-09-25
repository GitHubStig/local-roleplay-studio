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
 * The text sent to the Image Model. It always starts with "adult": every person depicted is an
 * adult, whatever the paragraph says.
 */
export function renderPrompt(prompt: ImagePrompt): string {
  return `adult, ${prompt}`
}
