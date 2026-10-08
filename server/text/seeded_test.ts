import { assertEquals, assertNotEquals } from '@std/assert'
import type { Chat, ChatCall } from './chat.ts'
import { seededChat, seedFor } from './seeded.ts'

const call = (content: string) => ({ messages: [{ role: 'user' as const, content }] })

Deno.test('A Session asking the same thing again gets a new seed', () => {
  const s = { session: 'again', seed: 42 }
  const first = seedFor(s, call('Hi'))
  assertNotEquals(seedFor(s, call('Hi')), first)
  assertNotEquals(seedFor(s, call('Hello')), first)
})

Deno.test('Sessions with the same seed ask with the same seeds, in any order', () => {
  const a = { session: 'a', seed: 7 }
  const b = { session: 'b', seed: 7 }
  const inA = [seedFor(a, call('one')), seedFor(a, call('two')), seedFor(a, call('one'))]
  const two = seedFor(b, call('two'))
  const one = [seedFor(b, call('one')), seedFor(b, call('one'))]
  assertEquals([one[0], two, one[1]], inA)
  assertNotEquals(seedFor({ session: 'c', seed: 8 }, call('one')), inA[0])
})

Deno.test('A seeded Chat passes each call on with its seed', async () => {
  const seen: ChatCall[] = []
  const chat: Chat = {
    model: 'm',
    thinks: true,
    stream: (c) => {
      seen.push(c)
      return Promise.resolve({ content: 'ok', thinking: '' })
    },
  }
  const seeded = seededChat(chat, { session: 'chat', seed: 3 })
  const signal = new AbortController().signal
  await seeded.stream({ ...call('Hi'), maxTokens: 10, signal })
  assertEquals([seeded.model, seeded.thinks], ['m', true])
  assertEquals(seen[0].seed, seedFor({ session: 'chat-replay', seed: 3 }, call('Hi')))
})
