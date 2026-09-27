import { JsonStreamReader } from '../jsonStream.ts'
import { type ChatMessage, ollamaChat, within } from '../ollamaChat.ts'
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
  parseRoleplayLook,
  parseShown,
  roleplayLookSchema,
  wholeSentences,
} from './art.ts'

/** A reply's fields as each one completes, and the model's reasoning as it streams. */
export interface ReplyHandlers {
  thinking?: (chunk: string) => void
  field?: (key: keyof Reply, value: string) => void
}

/** The Text Model's two jobs in a Roleplay. */
export interface RoleplayModel {
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
  ): Promise<{ body: string; shown: Shown; thinking?: string }>
  /** The Character's next reply to the conversation so far (or the opening, to none). */
  reply(
    messages: ChatMessage[],
    signal: AbortSignal,
    on?: ReplyHandlers,
  ): Promise<Reply & { thinking?: string }>
}

const MAX_TOKENS = { reply: 1024, cast: 1024, art: 1600, thinking: 12288 }

/**
 * Penalise repeating anything already in the conversation. Without it, a long Roleplay's Replies
 * loop on their own refrains ("the rain hammers the roof…"): replaying Frame 24 of a 30-Frame
 * Roleplay, 7–29% of five-word phrases repeated earlier Replies; with this, 0–1%, and early Frames
 * read as before. An instruction not to repeat didn't help; presence and frequency penalties broke
 * the output.
 */
const REPLY_SAMPLING = { repeat_penalty: 1.15, repeat_last_n: -1 }
const TIME_LIMIT_MS = { answer: 2 * 60_000, thinking: 10 * 60_000 }

export interface OllamaRoleplayOptions {
  think?: boolean
  baseUrl?: string
  /** Overrides the time limits, in ms (for tests). */
  timeLimits?: Partial<typeof TIME_LIMIT_MS>
}

export function ollamaRoleplayModel(
  model: string,
  opts: OllamaRoleplayOptions = {},
): RoleplayModel {
  const chat = ollamaChat(model, {
    think: opts.think,
    baseUrl: opts.baseUrl,
    thinkingTokens: MAX_TOKENS.thinking,
  })
  const limits = { ...TIME_LIMIT_MS, ...opts.timeLimits }
  const limit = () => (chat.thinks ? limits.thinking : limits.answer)
  const withThinking = <T extends object>(value: T, thinking: string) =>
    thinking ? { ...value, thinking } : value

  return {
    writeCast: (scenario, signal, onThinking) =>
      within(signal, limit(), async (s) => {
        const { content, thinking } = await chat.stream({
          messages: await castMessages(scenario),
          format: castSchema(),
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
          format: roleplayLookSchema,
          maxTokens: MAX_TOKENS.art,
          signal: s,
          onThinking,
        })
        return withThinking({ look: parseRoleplayLook(parseJson(content)) }, thinking)
      }),

    pictureFrame: (messages, signal, onThinking) =>
      within(signal, limit(), async (s) => {
        const { content, thinking } = await chat.stream({
          messages,
          format: artFrameSchema,
          maxTokens: MAX_TOKENS.art,
          signal: s,
          onThinking,
        })
        const fields = wholeSentences(parseJson(content) as Record<string, unknown>)
        return withThinking(
          { body: parseFrameBody(fields), shown: parseShown(fields) },
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
          format: replySchema(),
          maxTokens: MAX_TOKENS.reply,
          options: REPLY_SAMPLING,
          signal: s,
          onThinking: on.thinking,
          onContent: (chunk) => reader.feed(chunk),
        })
        return withThinking(parseReplyText(content), thinking)
      }),
  }
}
