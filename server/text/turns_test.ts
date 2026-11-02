import { assertEquals, assertRejects } from '@std/assert'
import type { Chat } from './chat.ts'
import { reportingTurns, turnTakingChat } from './turns.ts'

Deno.test('A turn-taking Chat calls once its turn comes, and ends the turn however the call ends', async () => {
  const log: string[] = []
  let fail = false
  const chat: Chat = {
    model: 'm',
    thinks: false,
    stream: () => {
      log.push('call')
      return fail
        ? Promise.reject(new Error('down'))
        : Promise.resolve({ content: 'ok', thinking: '' })
    },
  }
  const turned = turnTakingChat(chat, () => {
    log.push('turn')
    return Promise.resolve(() => void log.push('end'))
  })
  const call = { messages: [], maxTokens: 10, signal: new AbortController().signal }
  assertEquals((await turned.stream(call)).content, 'ok')
  fail = true
  await assertRejects(() => turned.stream(call), Error, 'down')
  assertEquals(log, ['turn', 'call', 'end', 'turn', 'call', 'end'])
})

Deno.test('A call that waits its turn reports it, and again when its turn comes', async () => {
  const chat: Chat = {
    model: 'm',
    thinks: false,
    stream: () => Promise.resolve({ content: 'ok', thinking: '' }),
  }
  let wait = true
  const turned = turnTakingChat(chat, (_call, onWait) => {
    if (wait) onWait()
    return Promise.resolve(() => {})
  })
  const call = { messages: [], maxTokens: 10, signal: new AbortController().signal }
  const phases: string[] = []
  await reportingTurns((phase) => phases.push(phase), async () => {
    await turned.stream(call)
    wait = false
    await turned.stream(call)
  })
  assertEquals(phases, ['queued', 'text'])
  // Outside a piece of work that reports, it waits as quietly.
  wait = true
  await turned.stream(call)
})
