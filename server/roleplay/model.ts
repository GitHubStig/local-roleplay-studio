import { JsonStreamReader } from '../jsonStream.ts'
import { type ChatMessage, ollamaChat, within } from '../ollamaChat.ts'
import type { Scenario } from '../scenario.ts'
import {
  castMessages,
  castSchema,
  parseCastText,
  parseReplyText,
  REPLY_FIELDS,
  replySchema,
} from './prompt.ts'
import type { Cast, Reply } from './types.ts'

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
  /** The Character's next reply to the conversation so far (or the opening, to none). */
  reply(
    messages: ChatMessage[],
    signal: AbortSignal,
    on?: ReplyHandlers,
  ): Promise<Reply & { thinking?: string }>
}

const MAX_TOKENS = { reply: 1024, cast: 1024, thinking: 12288 }
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
          signal: s,
          onThinking: on.thinking,
          onContent: (chunk) => reader.feed(chunk),
        })
        return withThinking(parseReplyText(content), thinking)
      }),
  }
}
