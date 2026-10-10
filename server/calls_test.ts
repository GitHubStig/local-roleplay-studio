import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { callFile, type CallRecord, logCalls, logCallsUnder, loggedChat } from './calls.ts'
import type { Chat, ChatCall } from './text/chat.ts'
import { withTempDir } from './testing.ts'

const signal = new AbortController().signal

/** A Chat answering `{"line":"…"}` with the user's message, or failing on "fail". */
const echo: Chat = {
  model: 'echo',
  thinks: false,
  stream: (call: ChatCall) => {
    const said = call.messages.at(-1)!.content
    if (said === 'fail') return Promise.reject(new Error('It failed'))
    return Promise.resolve({ content: JSON.stringify({ line: said }), thinking: '' })
  },
}

const ask = (chat: Chat, content: string) =>
  chat.stream({
    messages: [{ role: 'user', content }],
    schema: { type: 'object' },
    maxTokens: 10,
    job: 'reply',
    signal,
  })

const exists = (path: string) =>
  Deno.stat(path).then(() => true, (err) => {
    if (err instanceof Deno.errors.NotFound) return false
    throw err
  })

const read = async (path: string): Promise<CallRecord[]> =>
  JSON.parse(await Deno.readTextFile(path))

Deno.test('Calls are logged in their Frame’s file, oldest first, as a JSON array', async () => {
  await withTempDir(async (dir) => {
    const chat = loggedChat(echo)
    await logCalls(true, dir, 2, async () => {
      await ask(chat, 'one')
      await ask(chat, 'two')
    })
    const calls = await read(join(dir, 'calls', 'frame-3.json'))
    assertEquals(calls.map((c) => c.response?.reply), [{ line: 'one' }, { line: 'two' }])
    assertEquals(calls[0].job, 'reply')
    assertEquals(calls[0].model, 'echo')
    assertEquals(calls[0].request.messages, [{ role: 'user', content: 'one' }])
  })
})

Deno.test('Calls that are no Frame’s go in setup.json, and logCallsUnder moves them', async () => {
  await withTempDir(async (dir) => {
    const chat = loggedChat(echo)
    await logCalls(true, dir, null, async () => {
      await ask(chat, 'cast')
      await logCallsUnder(0, () => ask(chat, 'suggest'))
    })
    assertEquals((await read(callFile(dir, null))).length, 1)
    assertEquals((await read(callFile(dir, 0))).length, 1)
  })
})

Deno.test('Calls made at once are all logged', async () => {
  await withTempDir(async (dir) => {
    const chat = loggedChat(echo)
    await logCalls(true, dir, 0, () => Promise.all(['a', 'b', 'c'].map((s) => ask(chat, s))))
    assertEquals((await read(callFile(dir, 0))).length, 3)
  })
})

Deno.test('A failed call is logged with its error', async () => {
  await withTempDir(async (dir) => {
    await assertRejects(() => logCalls(true, dir, 0, () => ask(loggedChat(echo), 'fail')))
    const [call] = await read(callFile(dir, 0))
    assertEquals(call.error, 'It failed')
    assertEquals(call.response, undefined)
  })
})

Deno.test('Nothing is logged when the log is off, or outside a piece of work', async () => {
  await withTempDir(async (dir) => {
    const chat = loggedChat(echo)
    await logCalls(false, dir, 0, () => ask(chat, 'off'))
    await ask(chat, 'outside')
    assertEquals(await exists(join(dir, 'calls')), false)
  })
})

Deno.test('A Session removed meanwhile gets no folder back', async () => {
  await withTempDir(async (dir) => {
    const gone = join(dir, 'gone')
    await logCalls(true, gone, 0, () => ask(loggedChat(echo), 'hi'))
    assertEquals(await exists(gone), false)
  })
})
