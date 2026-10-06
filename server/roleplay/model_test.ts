import { assertEquals } from '@std/assert'
import { briefScenario } from '../scenario.ts'
import { ollamaChat } from '../text/ollama/ollama.ts'
import { chatRoleplayModel } from './model.ts'
import { testCast } from './testing.ts'

/** A stand-in Ollama that answers every call with `content`, recording each request body. */
function fakeOllama(content: string) {
  const requests: Record<string, unknown>[] = []
  const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    requests.push(await req.json())
    return new Response(JSON.stringify({ message: { content }, done: true }) + '\n')
  })
  return {
    baseUrl: `http://localhost:${server.addr.port}`,
    requests,
    close: () => server.shutdown(),
  }
}

Deno.test('Replies penalise repeating the conversation; Cast calls do not', async () => {
  const reply = fakeOllama('{"internal":"","actions":"Kael waits.","dialogue":"..."}')
  const cast = fakeOllama(JSON.stringify(testCast))
  try {
    const signal = new AbortController().signal
    const answer = await chatRoleplayModel(ollamaChat('m', { baseUrl: reply.baseUrl })).reply(
      [{ role: 'user', content: 'Hi' }],
      signal,
    )
    assertEquals(answer, { internal: '', actions: 'Kael waits.', dialogue: '' })
    assertEquals(reply.requests[0].options, {
      repeat_penalty: 1.15,
      repeat_last_n: 131_072,
      num_predict: 1024,
    })

    await chatRoleplayModel(ollamaChat('m', { baseUrl: cast.baseUrl })).writeCast(
      briefScenario('A tavern.'),
      signal,
    )
    assertEquals(cast.requests[0].options, { num_predict: 1024 })
  } finally {
    await reply.close()
    await cast.close()
  }
})
