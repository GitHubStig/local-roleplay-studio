/**
 * Suggest: writes the player's next Message for them, streamed into the text box to edit or send.
 * Nothing is saved; a suggestion that's sent is an ordinary Message, checked like any other. Its
 * prompts are `prompts/roleplay/suggest*.md`.
 */
import { activeProseLimits, crossedLimit, limitsEnabled } from '../limits.ts'
import type { ChatMessage } from '../text/chat.ts'
import { loadPrompt } from '../promptFiles.ts'
import { storyText } from './art.ts'
import type { RoleplayModel } from './model.ts'
import type { RoleplaySession } from './types.ts'

/** How many of the player's latest Messages are shown to Suggest for their style. */
const EXAMPLES = 5

export type SuggestEvent =
  | { type: 'phase'; phase: 'text' }
  /** The suggestion as written so far, untidied. */
  | { type: 'suggestion-part'; text: string }
  /** The whole suggestion, tidied. */
  | { type: 'suggestion'; text: string }

export class SuggestError extends Error {}

/**
 * The Suggest call: the story as the Persona knows it, their earlier Messages for style, and the
 * player's `draft` (what's already in the text box) to write the Message from, if any.
 */
export async function suggestMessages(
  session: RoleplaySession,
  draft: string,
): Promise<ChatMessage[]> {
  const cast = session.cast
  if (!cast || !session.frames.length) throw new SuggestError('The scene has not begun yet')
  const examples = session.frames
    .flatMap((f) => (f.message === null ? [] : [f.message]))
    .slice(-EXAMPLES)
  const limits = await loadPrompt(
    limitsEnabled() ? 'roleplay/suggest-limits' : 'roleplay/suggest-limits-adults-only',
    { ...cast },
  )
  return [
    { role: 'system', content: await loadPrompt('roleplay/suggest', { ...cast, limits }) },
    {
      role: 'user',
      content: await loadPrompt('roleplay/suggest-request', {
        ...cast,
        story: storyText(session, session.frames.length - 1),
        examples: examples.length ? examples.map((m) => `- ${m}`).join('\n') : 'none yet',
        length: typicalLength(examples),
        draft: draft.trim() || 'none',
      }),
    },
  ]
}

/**
 * How long the player's messages usually are: the median, in words. Told only "their length",
 * models wrote two or three polished sentences for a player who types one short line.
 */
export function typicalLength(messages: string[]): string {
  if (!messages.length) return 'one or two sentences'
  const words = messages.map((m) => m.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b)
  const median = words[Math.floor(words.length / 2)]
  return `about ${median} word${median === 1 ? '' : 's'}`
}

/**
 * Tidies a suggestion: an introduction ("Here's the message:"), the Persona's name in front, and
 * quote marks around the whole of it are dropped. The player's own Messages have none of these.
 */
export function cleanSuggestion(text: string, personaName: string): string {
  let s = text.trim()
  s = s.replace(/^(?:here(?:'s| is)[^\n]*:|sure[^\n]*:)\s*/i, '')
  const names = [personaName, personaName.split(/\s+/)[0]].map((n) =>
    n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )
  s = s.replace(new RegExp(`^\\**(?:${names.join('|')})\\**\\s*:\\**\\s*`, 'i'), '')
  const quoted = s.match(/^["“](.*)["”]$/s)
  if (quoted && !/["“”]/.test(quoted[1])) s = quoted[1]
  return s.trim()
}

/**
 * Writes a suggestion for the Roleplay's next Message, passing it on as it's written. Throws if
 * the model wrote nothing, or something that crosses a Limit in force.
 */
export async function suggestMessage(
  model: RoleplayModel,
  session: RoleplaySession,
  draft: string,
  emit: (event: SuggestEvent) => void,
  signal: AbortSignal,
): Promise<string> {
  const messages = await suggestMessages(session, draft)
  emit({ type: 'phase', phase: 'text' })
  let written = ''
  const raw = await model.suggest(messages, signal, (chunk) => {
    written += chunk
    emit({ type: 'suggestion-part', text: written })
  })
  signal.throwIfAborted()
  const text = cleanSuggestion(raw, session.cast!.persona.name)
  if (!text) throw new SuggestError('The Text Model suggested nothing; try again')
  const limit = crossedLimit(text, activeProseLimits())
  if (limit) throw new SuggestError(`The suggestion crossed a limit (${limit.message}); try again`)
  emit({ type: 'suggestion', text })
  return text
}
