/**
 * The Art Agent: turns a Roleplay Frame into an Image Prompt, the same shape as a Storyboard
 * Frame's: identity, the Frame's seven sentences, then style. The identity is the Look's sentence
 * for each person the picture shows, so someone who has left the scene isn't drawn into it.
 * Its prompts are `prompts/roleplay/art-*.md`. Rendering the prompt comes later.
 */
import { stringify } from '@std/yaml'
import { renderPrompt } from '../imagePrompt.ts'
import { crossedLimit, limitsEnabled } from '../limits.ts'
import type { ChatMessage } from '../ollamaChat.ts'
import { loadPrompt } from '../promptFiles.ts'
import type { Scenario } from '../scenario.ts'
import { composePrompt } from '../storyboard.ts'
import { frameSchema, plainSentences } from '../textModel.ts'
import type { Cast, RoleplayFrame, RoleplayLook, RoleplaySession, Shown } from './types.ts'

/**
 * A Frame's seven sentences, each capped in length. A long story gives the Art Agent a lot to say:
 * without the cap it wrote three or four sentences per aspect for a busy Frame. The cap cuts a
 * field off mid-sentence, so `wholeSentences` drops what it cut.
 */
export const artFrameSchema = {
  type: 'object',
  properties: {
    // First, so the sentences are written knowing who is in the picture. A yes or no per person:
    // offered a choice of "both", "character" or "persona", the model always took the first.
    character_shown: { type: 'boolean', description: 'is the character in the picture?' },
    persona_shown: { type: 'boolean', description: 'is the persona in the picture?' },
    ...Object.fromEntries(
      Object.entries(frameSchema.properties).map((
        [key, field],
      ) => [key, { ...field, maxLength: 280 }]),
    ),
  },
  required: ['character_shown', 'persona_shown', ...frameSchema.required],
}

/**
 * Who a picture shows, from the Art Agent's reply; a person it didn't answer for counts as shown.
 * Neither means no one: the picture is of the place alone.
 */
export function parseShown(fields: Record<string, unknown>): Shown {
  const character = fields.character_shown !== false
  const persona = fields.persona_shown !== false
  if (character && persona) return 'both'
  if (character) return 'character'
  if (persona) return 'persona'
  return 'none'
}

const sentence = (description: string) => ({ type: 'string', description })

export const roleplayLookSchema = {
  type: 'object',
  properties: {
    character: sentence("the character's identity: name, age, build, skin, hair, face"),
    persona: sentence("the persona's identity: name, age, build, skin, hair, face"),
    style: sentence('the art style and medium'),
  },
  required: ['character', 'persona', 'style'],
}

/** A Look from before pictures chose who is shown: one `subject` sentence for both people. */
export const isRoleplayLook = (look: unknown): look is RoleplayLook =>
  typeof (look as RoleplayLook | null)?.character === 'string'

/** Reads a Look; throws if any of its three sentences is missing. */
export function parseRoleplayLook(value: unknown): RoleplayLook {
  const v = (value ?? {}) as Record<string, unknown>
  const look = {
    character: plainSentences(String(v.character ?? '')),
    persona: plainSentences(String(v.persona ?? '')),
    style: plainSentences(String(v.style ?? '')),
  }
  if (!look.character || !look.persona || !look.style) {
    throw new Error('The Look needs both identities and a style')
  }
  return look
}

/** The identity sentences for who a picture shows; none for a picture of no one. */
export function identityFor(look: RoleplayLook, shown: Shown): string {
  if (shown === 'none') return ''
  if (shown === 'character') return look.character
  if (shown === 'persona') return look.persona
  return `${look.character} ${look.persona}`
}

/** Each field's text up to its last complete sentence, or all of it if none is complete. */
export function wholeSentences(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => {
      if (typeof value !== 'string' || /[.!?]["')\]]?\s*$/.test(value)) return [key, value]
      const end = Math.max(value.lastIndexOf('.'), value.lastIndexOf('!'), value.lastIndexOf('?'))
      return [key, end > 0 ? value.slice(0, end + 1) : value]
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

/** The call that writes a Roleplay's Look, from its Cast and Brief. */
export async function artLookMessages(
  session: RoleplaySession,
  scenario: Scenario,
): Promise<ChatMessage[]> {
  return [
    {
      role: 'system',
      content: await loadPrompt('roleplay/art-look', { limits: await artLimits() }),
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
): Promise<ChatMessage[]> {
  return [
    {
      role: 'system',
      content: await loadPrompt('roleplay/art-frame', {
        ...session.cast!,
        limits: await artLimits(),
      }),
    },
    {
      role: 'user',
      content: await loadPrompt('roleplay/art-frame-request', {
        look: block(session.look!),
        story: storyText(session, index),
        frame: index,
      }),
    },
  ]
}

/**
 * While the Limits are on, a picture showing both people must say what each wears. Told to keep
 * within the Limits, the Art Agent sometimes leaves an undressed person's clothing out instead of
 * dressing them, and an image model left to guess may not dress them either.
 */
export function undressed(
  cast: Cast,
  shown: Shown,
  clothing: string | undefined,
): string | undefined {
  if (!limitsEnabled() || shown !== 'both' || clothing === undefined) return undefined
  const firstName = (name: string) => name.split(/\s+/)[0].toLowerCase()
  const text = clothing.toLowerCase()
  const missing = [cast.character.name, cast.persona.name].some((n) => !text.includes(firstName(n)))
  return missing ? "everyone shown must be dressed (name each person's clothes)" : undefined
}

/**
 * A Frame with its picture's sentences, its Image Prompt, and whether it crosses a Limit. A
 * rendered picture whose Image Prompt changes is marked stale until rendered again.
 */
export function pictured(
  frame: RoleplayFrame,
  look: RoleplayLook,
  cast: Cast,
  body: string,
  shown: Shown = 'both',
  clothing = frame.clothing,
): RoleplayFrame {
  const { blocked: _, stale: __, ...rest } = frame
  const prompt = composePrompt({ subject: identityFor(look, shown), style: look.style }, body)
  const promptText = renderPrompt(prompt)
  const blocked = crossedLimit(promptText)?.message ?? undressed(cast, shown, clothing)
  const stale = !!frame.image && (frame.stale || promptText !== frame.promptText)
  return {
    ...rest,
    body,
    shown,
    ...(clothing !== undefined ? { clothing } : {}),
    prompt,
    promptText,
    ...(blocked ? { blocked } : {}),
    ...(stale ? { stale } : {}),
  }
}
