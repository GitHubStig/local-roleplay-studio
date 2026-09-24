/**
 * The nine sections of an Image Prompt, in the order they're joined for the Image Model:
 * subject and identity → pose and limbs → expression → camera angle and framing → clothing →
 * environment → lighting → color → art style and medium.
 */
export const SECTIONS = [
  {
    key: 'subject',
    label: 'subject and identity',
    covers: 'who is shown: age, build, skin, hair, face; never pose, clothing or setting',
  },
  { key: 'pose', label: 'pose and limbs', covers: 'body position, limbs and hands' },
  { key: 'expression', label: 'expression', covers: 'facial expression and where they look' },
  {
    key: 'camera',
    label: 'camera angle and framing',
    covers: 'camera angle, lens and how much of the subject is in frame',
  },
  { key: 'clothing', label: 'clothing', covers: 'every garment and accessory worn' },
  { key: 'environment', label: 'environment', covers: 'the location, backdrop and props' },
  { key: 'lighting', label: 'lighting', covers: 'the light sources, their direction and quality' },
  { key: 'color', label: 'color', covers: 'the palette and color grading' },
  {
    key: 'style',
    label: 'art style and medium',
    covers: 'the medium (photograph, painting, render…) and its style',
  },
] as const

export type SectionKey = (typeof SECTIONS)[number]['key']

/** The whole state of a Session at one Turn: what the next image shows, section by section. */
export type ImagePrompt = Record<SectionKey, string>

/** JSON schema for an Image Prompt, for the Text Model's structured output. */
export function imagePromptSchema() {
  return {
    type: 'object',
    properties: Object.fromEntries(
      SECTIONS.map((s) => [s.key, { type: 'string', description: `${s.label}: ${s.covers}` }]),
    ),
    required: SECTIONS.map((s) => s.key),
  }
}

/** Checks a value is a complete Image Prompt; throws naming the sections that are missing. */
export function parseImagePrompt(value: unknown): ImagePrompt {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Image Prompt must be an object')
  }
  const v = value as Record<string, unknown>
  const missing = SECTIONS.filter((s) => typeof v[s.key] !== 'string' || !String(v[s.key]).trim())
  if (missing.length > 0) {
    throw new Error(`Image Prompt is missing: ${missing.map((s) => s.key).join(', ')}`)
  }
  return Object.fromEntries(SECTIONS.map((s) => [s.key, String(v[s.key]).trim()])) as ImagePrompt
}

/**
 * The text sent to the Image Model: the sections in order. It always starts with "adult": every
 * person depicted is an adult, whatever the sections say.
 */
export function renderPrompt(prompt: ImagePrompt): string {
  return ['adult', ...SECTIONS.map((s) => prompt[s.key])].join(', ')
}

/** The sections whose text differs between two Image Prompts. */
export function changedSections(before: ImagePrompt, after: ImagePrompt): SectionKey[] {
  return SECTIONS.filter((s) => before[s.key] !== after[s.key]).map((s) => s.key)
}
