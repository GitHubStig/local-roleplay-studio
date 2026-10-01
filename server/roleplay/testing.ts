import type { ChatMessage } from '../ollamaChat.ts'
import type { RoleplayModel } from './model.ts'
import { REPLY_FIELDS } from './prompt.ts'
import type { Cast, Reply, RoleplayLook } from './types.ts'

export const testCast: Cast = {
  character: {
    name: 'Mira Vance',
    age: 34,
    appearance: 'Tall, weathered, grey braid, a salt-stained navy coat.',
    personality: 'Dry, watchful, fiercely loyal to her crew.',
    voice: 'Short sentences; sailor slang.',
    background: 'Navigator of the Kestrel for ten years.',
    goal: 'Get the ship through the storm before dawn.',
  },
  persona: {
    name: 'Sam Reyes',
    role: 'The new first mate.',
    appearance: 'Young, soaked, nervous.',
  },
  setting: {
    place: 'The bridge of the Kestrel.',
    time: 'Just before midnight.',
    weather: 'A gale.',
  },
}

export const replyOf = (dialogue: string, extra: Partial<Reply> = {}): Reply => ({
  internal: '',
  actions: 'Mira grips the wheel.',
  dialogue,
  ...extra,
})

/**
 * A Roleplay model that plays back scripted Casts and replies, recording the messages each reply
 * was asked for. Streams each reply's fields as the real one does.
 */
export function scriptedRoleplayModel(
  script: {
    casts?: (Cast | Error)[]
    replies?: (Reply | Error)[]
    looks?: (RoleplayLook | Error)[]
    bodies?: (string | Error)[]
    suggestions?: (string | Error)[]
    voices?: (string | Error)[]
    /** Reported as the model's name; 'scripted' unless given. */
    name?: string
  },
): RoleplayModel & {
  asked: ChatMessage[][]
  art: ChatMessage[][]
  styles: string[]
  suggested: ChatMessage[][]
} {
  const next = <T>(queue: (T | Error)[] | undefined, what: string): Promise<T> => {
    const item = queue?.shift()
    if (!item) return Promise.reject(new Error(`no scripted ${what} left`))
    return item instanceof Error ? Promise.reject(item) : Promise.resolve(item)
  }
  const model = {
    name: script.name ?? 'scripted',
    asked: [] as ChatMessage[][],
    async writeCast(_scenario: unknown, signal: AbortSignal) {
      signal.throwIfAborted()
      return { cast: await next(script.casts, 'Cast') }
    },
    /** The messages each Art Agent call was given, and the style each picture was asked in. */
    art: [] as ChatMessage[][],
    styles: [] as string[],
    async writeLook(messages: ChatMessage[], signal: AbortSignal) {
      model.art.push(messages)
      signal.throwIfAborted()
      return { look: await next(script.looks, 'Look') }
    },
    async pictureFrame(
      messages: ChatMessage[],
      signal: AbortSignal,
      _onThinking?: unknown,
      style?: string,
    ) {
      model.styles.push(style ?? 'prose')
      model.art.push(messages)
      signal.throwIfAborted()
      return {
        body: await next(script.bodies, 'picture'),
        shown: 'both' as const,
        clothing: 'Mira wears a navy coat; Sam wears oilskins.',
        thinking: 'Kael first, then the bar.',
      }
    },
    async reply(
      messages: ChatMessage[],
      signal: AbortSignal,
      on: { field?: (key: keyof Reply, value: string) => void } = {},
    ) {
      model.asked.push(messages)
      signal.throwIfAborted()
      const reply = await next(script.replies, 'reply')
      for (const key of REPLY_FIELDS) on.field?.(key, reply[key])
      return reply
    },
    async writeVoice(_messages: ChatMessage[], signal: AbortSignal) {
      signal.throwIfAborted()
      return { description: await next(script.voices, 'voice') }
    },
    /** The messages each Suggest call was given. */
    suggested: [] as ChatMessage[][],
    async suggest(messages: ChatMessage[], signal: AbortSignal, onText?: (chunk: string) => void) {
      model.suggested.push(messages)
      signal.throwIfAborted()
      const text = await next(script.suggestions, 'suggestion')
      // Streamed in two pieces, as the real one streams many.
      const half = Math.ceil(text.length / 2)
      onText?.(text.slice(0, half))
      onText?.(text.slice(half))
      return text
    },
  }
  return model
}
