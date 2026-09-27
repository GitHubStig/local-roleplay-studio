import type { ChatMessage } from '../ollamaChat.ts'
import type { RoleplayModel } from './model.ts'
import { REPLY_FIELDS } from './prompt.ts'
import type { Look } from '../session.ts'
import type { Cast, Reply } from './types.ts'

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
    looks?: (Look | Error)[]
    bodies?: (string | Error)[]
  },
): RoleplayModel & { asked: ChatMessage[][]; art: ChatMessage[][] } {
  const next = <T>(queue: (T | Error)[] | undefined, what: string): Promise<T> => {
    const item = queue?.shift()
    if (!item) return Promise.reject(new Error(`no scripted ${what} left`))
    return item instanceof Error ? Promise.reject(item) : Promise.resolve(item)
  }
  const model = {
    asked: [] as ChatMessage[][],
    async writeCast(_scenario: unknown, signal: AbortSignal) {
      signal.throwIfAborted()
      return { cast: await next(script.casts, 'Cast') }
    },
    /** The messages each Art Agent call was given. */
    art: [] as ChatMessage[][],
    async writeLook(messages: ChatMessage[], signal: AbortSignal) {
      model.art.push(messages)
      signal.throwIfAborted()
      return { look: await next(script.looks, 'Look') }
    },
    async pictureFrame(messages: ChatMessage[], signal: AbortSignal) {
      model.art.push(messages)
      signal.throwIfAborted()
      return { body: await next(script.bodies, 'picture'), thinking: 'Kael first, then the bar.' }
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
  }
  return model
}
