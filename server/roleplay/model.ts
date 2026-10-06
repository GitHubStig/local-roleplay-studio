import { JsonStreamReader } from '../jsonStream.ts'
import { type Chat, type ChatMessage, within } from '../text/chat.ts'
import type { Scenario } from '../scenario.ts'
import {
  castMessages,
  castSchema,
  parseCastText,
  parseJson,
  parseReplyText,
  REPLY_FIELDS,
  replySchema,
} from './prompt.ts'
import type { Cast, Reply, RoleplayLook, Shown } from './types.ts'
import { parseFrameBody } from '../textModel.ts'
import {
  artFrameSchema,
  type ArtStyle,
  artTagsSchema,
  joinTags,
  parseRoleplayLook,
  parseShown,
  roleplayLookSchema,
  trimFields,
} from './art.ts'
import { deliverySchema, parseDelivery, voiceSchema } from './voice.ts'
import type { Delivery } from '../voice.ts'

/** A reply's fields as each one completes, and the model's reasoning as it streams. */
export interface ReplyHandlers {
  thinking?: (chunk: string) => void
  field?: (key: keyof Reply, value: string) => void
}

/** The Text Model's two jobs in a Roleplay. */
export interface RoleplayModel {
  /** The Text Model's name, recorded with what it writes. */
  readonly name: string
  /** Writes the Cast from a Brief (or a Scenario). */
  writeCast(
    scenario: Scenario,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<{ cast: Cast; thinking?: string }>
  /** The Art Agent: a Roleplay's Look (see `art.ts` for the messages). */
  writeLook(
    messages: ChatMessage[],
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<{ look: RoleplayLook; thinking?: string }>
  /** The Art Agent: who one Frame's picture shows, and its seven sentences as a paragraph. */
  pictureFrame(
    messages: ChatMessage[],
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
    style?: ArtStyle,
  ): Promise<{ body: string; shown: Shown; clothing: string; thinking?: string }>
  /** The Character's next reply to the conversation so far (or the opening, to none). */
  reply(
    messages: ChatMessage[],
    signal: AbortSignal,
    on?: ReplyHandlers,
  ): Promise<Reply & { thinking?: string }>
  /** Describes the Character's voice (see `voice.ts` for the messages). */
  writeVoice(messages: ChatMessage[], signal: AbortSignal): Promise<{ description: string }>
  /** Directs one line: its pace, and a sound before it (see `voice.ts` for the messages). */
  directLine(messages: ChatMessage[], signal: AbortSignal): Promise<Delivery>
  /** Suggest: the player's next Message, as plain text (see `suggest.ts` for the messages). */
  suggest(
    messages: ChatMessage[],
    signal: AbortSignal,
    onText?: (chunk: string) => void,
  ): Promise<string>
}

const MAX_TOKENS = {
  reply: 1024,
  cast: 1024,
  art: 1600,
  suggest: 400,
  voice: 300,
  delivery: 60,
}

/**
 * Penalise repeating anything already in the conversation. Without it, a long Roleplay's Replies
 * loop on their own refrains ("the rain hammers the roof…"): replaying Frame 24 of a 30-Frame
 * Roleplay, 7–29% of five-word phrases repeated earlier Replies; with this, 0–1%, and early Frames
 * read as before. An instruction not to repeat didn't help; presence and frequency penalties broke
 * the output.
 */
const REPLY_REPEAT_PENALTY = {
  penalty: 1.15,
  /**
   * The whole conversation: as many tokens as a Text Model's context holds (131,072 for gemma4
   * here). Not -1, Ollama's documented "the whole context": the MLX engine accepts it, but models on
   * the GGUF engine refuse it ("Value must be between 0 <= value").
   */
  lastN: 131_072,
}
const TIME_LIMIT_MS = { answer: 2 * 60_000, thinking: 10 * 60_000 }

export interface RoleplayModelOptions {
  /** Overrides the time limits, in ms (for tests). */
  timeLimits?: Partial<typeof TIME_LIMIT_MS>
}

/** The Text Model's jobs in a Roleplay, on any backend's `chat`. */
export function chatRoleplayModel(chat: Chat, opts: RoleplayModelOptions = {}): RoleplayModel {
  const limits = { ...TIME_LIMIT_MS, ...opts.timeLimits }
  const limit = () => (chat.thinks ? limits.thinking : limits.answer)
  const withThinking = <T extends object>(value: T, thinking: string) =>
    thinking ? { ...value, thinking } : value

  return {
    name: chat.model,
    writeCast: (scenario, signal, onThinking) =>
      within(signal, limit(), async (s) => {
        const { content, thinking } = await chat.stream({
          messages: await castMessages(scenario),
          schema: castSchema(),
          maxTokens: MAX_TOKENS.cast,
          signal: s,
          onThinking,
        })
        return withThinking({ cast: parseCastText(content) }, thinking)
      }),

    writeLook: (messages, signal, onThinking) =>
      within(signal, limit(), async (s) => {
        const { content, thinking } = await chat.stream({
          messages,
          schema: roleplayLookSchema,
          maxTokens: MAX_TOKENS.art,
          signal: s,
          onThinking,
        })
        return withThinking({ look: parseRoleplayLook(parseJson(content)) }, thinking)
      }),

    pictureFrame: (messages, signal, onThinking, style = 'prose') =>
      within(signal, limit(), async (s) => {
        const { content, thinking } = await chat.stream({
          messages,
          schema: style === 'tags' ? artTagsSchema : artFrameSchema,
          maxTokens: MAX_TOKENS.art,
          signal: s,
          onThinking,
        })
        const fields = trimFields(parseJson(content) as Record<string, unknown>)
        return withThinking(
          {
            body: style === 'tags' ? joinTags(fields) : parseFrameBody(fields),
            shown: parseShown(fields),
            clothing: String(fields.clothing ?? ''),
          },
          thinking,
        )
      }),

    reply: (messages, signal, on = {}) =>
      within(signal, limit(), async (s) => {
        const reader = new JsonStreamReader({
          text: (key, value) => {
            if ((REPLY_FIELDS as readonly string[]).includes(key)) {
              on.field?.(key as keyof Reply, value.trim())
            }
          },
        })
        const { content, thinking } = await chat.stream({
          messages,
          schema: replySchema(),
          maxTokens: MAX_TOKENS.reply,
          repeatPenalty: REPLY_REPEAT_PENALTY,
          signal: s,
          onThinking: on.thinking,
          onContent: (chunk) => reader.feed(chunk),
        })
        return withThinking(parseReplyText(content), thinking)
      }),

    writeVoice: (messages, signal) =>
      within(signal, limit(), async (s) => {
        const { content } = await chat.stream({
          messages,
          schema: voiceSchema,
          maxTokens: MAX_TOKENS.voice,
          signal: s,
        })
        const description = String(
          (parseJson(content) as { description?: unknown }).description ?? '',
        )
          .replace(/\s+/g, ' ').trim()
        if (!description) throw new Error('The Text Model described no voice')
        return { description }
      }),

    directLine: (messages, signal) =>
      within(signal, limit(), async (s) => {
        const { content } = await chat.stream({
          messages,
          schema: deliverySchema,
          maxTokens: MAX_TOKENS.delivery,
          // Steady picks: at the default temperature the same line came back slow one time in two.
          temperature: 0.3,
          signal: s,
        })
        return parseDelivery(parseJson(content))
      }),

    suggest: (messages, signal, onText) =>
      within(signal, limit(), async (s) => {
        const { content } = await chat.stream({
          messages,
          maxTokens: MAX_TOKENS.suggest,
          signal: s,
          onContent: onText,
        })
        return content
      }),
  }
}
