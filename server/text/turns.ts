import type { Chat } from './chat.ts'

/**
 * Takes a turn for one call, resolving with what ends it; rejects if `signal` aborts while it
 * waits.
 */
export type TakeTurn = (signal: AbortSignal) => Promise<() => void>

/**
 * `chat`, with each call waiting its turn first (`take`), as heavy jobs on the Text Model's machine
 * do, and ending it once the call has ended, however it ends.
 */
export function turnTakingChat(chat: Chat, take: TakeTurn): Chat {
  return {
    get model() {
      return chat.model
    },
    get thinks() {
      return chat.thinks
    },
    async stream(call) {
      const release = await take(call.signal)
      try {
        return await chat.stream(call)
      } finally {
        release()
      }
    },
  }
}
