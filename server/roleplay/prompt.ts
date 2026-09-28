import { stringify } from '@std/yaml'
import type { ChatMessage } from '../ollamaChat.ts'
import { limitsEnabled } from '../limits.ts'
import { loadPrompt, type PromptValues } from '../promptFiles.ts'
import type { Scenario } from '../scenario.ts'
import type { Cast, Character, Persona, Reply, RoleplaySession, Setting } from './types.ts'

/** The reply's fields, in the order the model writes them: think, then act, then speak. */
export const REPLY_FIELDS = ['internal', 'actions', 'dialogue'] as const

const block = (value: object) => stringify(value, { lineWidth: 100 }).trim()

/**
 * The system message of every Reply, from `prompts/roleplay/character.md`: the same on every call
 * of a Roleplay (until the Cast is edited), so Ollama can reuse its work on it.
 */
export const roleplaySystem = async (cast: Cast): Promise<string> =>
  loadPrompt('roleplay/character', { ...cast, limits: await limitsFor({ ...cast }) })

/**
 * The Limits as the model is told them: every Limit, or, while they're off in Settings, only the
 * adult one (`prompts/roleplay/limits*.md`).
 */
const limitsFor = (values: PromptValues) =>
  loadPrompt(limitsEnabled() ? 'roleplay/limits' : 'roleplay/limits-adults-only', values)

/** The Character's latest line, for a Roleplay's card on Home. */
export function roleplayExcerpt(session: RoleplaySession): string | null {
  const last = session.frames.at(-1)?.reply
  const reply = last ? cleanReply(last) : undefined
  const text = reply ? reply.dialogue || reply.actions : ''
  if (!text) return null
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text
}

/** A reply as it's sent back to the model in the history: the same JSON it wrote. */
export const replyContent = (reply: Reply) =>
  JSON.stringify(Object.fromEntries(REPLY_FIELDS.map((k) => [k, reply[k]])))

/**
 * The whole conversation for the next reply: the system message, then each Frame's message and
 * reply in turn (the Character speaks first), then the player's new message.
 */
export async function roleplayMessages(
  session: RoleplaySession,
  message: string,
): Promise<ChatMessage[]> {
  if (!session.cast) throw new Error('This Roleplay has not been set up')
  const messages: ChatMessage[] = [{ role: 'system', content: await roleplaySystem(session.cast) }]
  for (const frame of session.frames) {
    if (frame.message !== null) messages.push({ role: 'user', content: frame.message })
    messages.push({ role: 'assistant', content: replyContent(cleanReply(frame.reply)) })
  }
  messages.push({ role: 'user', content: message })
  return messages
}

/**
 * The call for the Character's opening Reply: the same system message as every Reply, then a
 * request to open the scene (`prompts/roleplay/opening-request.md`), which isn't kept in the
 * history.
 */
export async function openingMessages(cast: Cast): Promise<ChatMessage[]> {
  return [
    { role: 'system', content: await roleplaySystem(cast) },
    { role: 'user', content: await loadPrompt('roleplay/opening-request', { ...cast }) },
  ]
}

const text = (description: string) => ({ type: 'string', description })

export const replySchema = () => ({
  type: 'object',
  properties: {
    internal: text('brief first-person thought, or ""'),
    actions: text('what the character physically does'),
    dialogue: text('what the character says aloud, or ""'),
  },
  required: [...REPLY_FIELDS],
})

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Reads a Reply; throws if it has neither actions nor dialogue. */
export function parseReply(value: unknown): Reply {
  const o = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const reply = cleanReply({
    internal: str(o.internal),
    actions: str(o.actions),
    dialogue: str(o.dialogue),
  })
  if (!reply.actions && !reply.dialogue) throw new Error('The reply had no actions or dialogue')
  return reply
}

/** JSON left at the end of a field: a stray brace, with or without quotes around it (`"}'}'}`). */
const TRAILING_JSON = /["'“”‘’\s]*[}\]][\s"'“”‘’}\]]*$/
/** Quote marks around the whole of the dialogue: the screen adds its own. */
const OUTER_QUOTES = /^["'“”‘’\s]+|["“”\s]+$/g

/**
 * Tidies a Reply the model wrote: JSON fragments off the end of any field, quote marks off the
 * dialogue (the screen quotes it), and a dialogue of only quotes or an ellipsis counted as
 * silence. Used on new Replies, and on saved ones as they're sent back to the model, so it stops
 * copying its own mistakes.
 */
export function cleanReply(reply: Reply): Reply {
  const tidy = (text: string) => text.replace(TRAILING_JSON, '').trim()
  const dialogue = tidy(reply.dialogue).replace(OUTER_QUOTES, '').trim()
  return {
    internal: tidy(reply.internal),
    actions: tidy(reply.actions),
    dialogue: /^[\s.…"'“”‘’]*$/.test(dialogue) ? '' : dialogue,
  }
}

export const parseReplyText = (content: string): Reply => parseReply(parseJson(content))

export function parseJson(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    throw new Error('The Text Model did not reply with valid JSON')
  }
}

// --- Writing the Cast ---------------------------------------------------------------------------

/**
 * The Cast call (`prompts/roleplay/cast.md`, `cast-request.md`). A Scenario's Setup facts and
 * Opening serve as the Brief; its notes are about writing image prompts, so they're left out.
 */
export async function castMessages(scenario: Scenario): Promise<ChatMessage[]> {
  const facts = Object.keys(scenario.setup).length ? block(scenario.setup) : 'none'
  return [
    {
      role: 'system',
      content: await loadPrompt('roleplay/cast', {
        limits: await limitsFor({
          character: { name: 'the Character' },
          persona: { name: 'the Persona' },
        }),
      }),
    },
    {
      role: 'user',
      content: await loadPrompt('roleplay/cast-request', { brief: scenario.openingPrompt, facts }),
    },
  ]
}

const object = (properties: Record<string, object>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
})

export const castSchema = () =>
  object({
    character: object({
      name: text('first and last name'),
      age: { type: 'integer', minimum: 18, description: '18 or over' },
      appearance: text('build, skin, hair, face, what they wear'),
      personality: text('temperament and manner'),
      voice: text('how they speak'),
      background: text('who they are and what brought them here'),
      goal: text('what they want in this scene, and what drives them'),
    }),
    persona: object({
      name: text("the player's character's name: a first name, or first and last"),
      role: text('who they are to the character'),
      appearance: text('a brief description'),
    }),
    setting: object({
      place: text('where the scene starts'),
      time: text('time of day'),
      weather: text('the weather, or conditions indoors'),
    }),
  })

/** A hand edit that's incomplete: a Cast (or a Character under 18), or a Look. */
export class CastError extends Error {}

/** Checks and tidies a Cast; throws a CastError listing what's wrong. */
export function parseCast(value: unknown): Cast {
  const o = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const part = (key: string) =>
    (typeof o[key] === 'object' && o[key] !== null ? o[key] : {}) as Record<string, unknown>
  const c = part('character')
  const p = part('persona')
  const s = part('setting')
  const character: Character = {
    name: str(c.name),
    age: Number(c.age),
    appearance: str(c.appearance),
    personality: str(c.personality),
    voice: str(c.voice),
    background: str(c.background),
    goal: str(c.goal),
  }
  const persona: Persona = { name: str(p.name), role: str(p.role), appearance: str(p.appearance) }
  const setting: Setting = { place: str(s.place), time: str(s.time), weather: str(s.weather) }

  const issues: string[] = []
  if (!Number.isInteger(character.age) || character.age < 18) {
    issues.push('the Character must be 18 or over')
  }
  for (
    const [what, fields] of [['character', character], ['persona', persona], [
      'setting',
      setting,
    ]] as const
  ) {
    for (const [key, value] of Object.entries(fields)) {
      if (value === '') issues.push(`${what} ${key} is missing`)
    }
  }
  if (issues.length) throw new CastError(`The Cast is incomplete: ${issues.join('; ')}`)
  return { character, persona, setting }
}

/** Reads the Cast call's reply. */
export const parseCastText = (content: string): Cast => parseCast(parseJson(content))
