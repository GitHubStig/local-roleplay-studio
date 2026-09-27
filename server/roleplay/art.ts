/**
 * The Art Agent: turns a Roleplay Frame into an Image Prompt, the same shape as a Storyboard
 * Frame's (the Look's subject sentence, the Frame's seven sentences, the Look's style sentence).
 * Its prompts are `prompts/roleplay/art-*.md`. Rendering the prompt comes later.
 */
import { stringify } from '@std/yaml'
import { renderPrompt } from '../imagePrompt.ts'
import { crossedLimit, limitsEnabled } from '../limits.ts'
import type { ChatMessage } from '../ollamaChat.ts'
import { loadPrompt } from '../promptFiles.ts'
import type { Scenario } from '../scenario.ts'
import type { Look } from '../session.ts'
import { composePrompt } from '../storyboard.ts'
import { frameSchema } from '../textModel.ts'
import type { RoleplayFrame, RoleplaySession } from './types.ts'

/**
 * A Frame's seven sentences, each capped in length. A long story gives the Art Agent a lot to say:
 * without the cap it wrote three or four sentences per aspect for a busy Frame. The cap cuts a
 * field off mid-sentence, so `wholeSentences` drops what it cut.
 */
export const artFrameSchema = {
  ...frameSchema,
  properties: Object.fromEntries(
    Object.entries(frameSchema.properties).map((
      [key, field],
    ) => [key, { ...field, maxLength: 280 }]),
  ),
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

/** A Frame with its picture's sentences, its Image Prompt, and whether it crosses a Limit. */
export function pictured(frame: RoleplayFrame, look: Look, body: string): RoleplayFrame {
  const { blocked: _, ...rest } = frame
  const prompt = composePrompt(look, body)
  const promptText = renderPrompt(prompt)
  const blocked = crossedLimit(promptText)?.message
  return { ...rest, body, prompt, promptText, ...(blocked ? { blocked } : {}) }
}
