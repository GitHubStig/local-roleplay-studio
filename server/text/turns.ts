import { AsyncLocalStorage } from 'node:async_hooks'
import type { Chat, ChatCall } from './chat.ts'

/**
 * Takes a turn for one call, resolving with what ends it; calls `onWait` first if it has to wait,
 * and rejects if its `signal` aborts while it waits.
 */
export type TakeTurn = (call: ChatCall, onWait: () => void) => Promise<() => void>

/** Where a piece of work reports that its call waits its turn (`queued`), then runs (`text`). */
type ReportPhase = (phase: 'queued' | 'text') => void
const reporting = new AsyncLocalStorage<ReportPhase>()

/**
 * Runs `work`, its Text Model calls reporting through `report` when they wait their turn and when
 * it comes, so the player sees a Reply waiting for a render rather than being written.
 */
export function reportingTurns<T>(report: ReportPhase, work: () => Promise<T>): Promise<T> {
  return reporting.run(report, work)
}

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
      const report = reporting.getStore()
      let waited = false
      const release = await take(call, () => {
        waited = true
        report?.('queued')
      })
      if (waited) report?.('text')
      try {
        return await chat.stream(call)
      } finally {
        release()
      }
    },
  }
}
