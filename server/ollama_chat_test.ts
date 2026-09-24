import { assertEquals, assertRejects } from '@std/assert'
import { ollamaTextModel } from './textModel.ts'
import { testScenario } from './testing.ts'

/** A stand-in Ollama /api/chat that streams NDJSON parts, recording each request body. */
function fakeOllama(
  respond: (body: Record<string, unknown>) => Response,
): { baseUrl: string; requests: Record<string, unknown>[]; close: () => Promise<void> } {
  const requests: Record<string, unknown>[] = []
  const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    const body = await req.json()
    requests.push(body)
    return respond(body)
  })
  return {
    baseUrl: `http://localhost:${server.addr.port}`,
    requests,
    close: () => server.shutdown(),
  }
}

const ndjson = (...parts: object[]) =>
  new Response(parts.map((p) => JSON.stringify(p)).join('\n') + '\n')

const answer = JSON.stringify({ outcome: 'done', narration: 'She stands.', scene: { pose: 'x' } })

Deno.test('ollamaTextModel streams thinking, then parses the answer', async () => {
  const ollama = fakeOllama(() =>
    ndjson(
      { message: { thinking: 'Hmm, ' } },
      { message: { thinking: 'stand.' } },
      { message: { content: answer.slice(0, 20) } },
      { message: { content: answer.slice(20) }, done: true },
    )
  )
  try {
    const chunks: string[] = []
    const text = await ollamaTextModel('m', { think: true, baseUrl: ollama.baseUrl }).write(
      { scenario: testScenario, scene: null, action: null },
      new AbortController().signal,
      (c) => chunks.push(c),
    )
    assertEquals(chunks, ['Hmm, ', 'stand.'])
    assertEquals(text.thinking, 'Hmm, stand.')
    assertEquals(text.narration, 'She stands.')
    assertEquals(ollama.requests[0].think, true)
    assertEquals(ollama.requests[0].stream, true)
  } finally {
    await ollama.close()
  }
})

Deno.test('ollamaTextModel retries without thinking for models that cannot think', async () => {
  const ollama = fakeOllama((body) =>
    body.think
      ? Response.json({ error: '"llama3" does not support thinking' }, { status: 400 })
      : ndjson({ message: { content: answer }, done: true })
  )
  try {
    const tm = ollamaTextModel('llama3', { think: true, baseUrl: ollama.baseUrl })
    const req = { scenario: testScenario, scene: null, action: null }
    const text = await tm.write(req, new AbortController().signal)
    assertEquals(text.thinking, undefined)
    assertEquals(ollama.requests.map((r) => r.think), [true, false])
    await tm.write(req, new AbortController().signal)
    assertEquals(ollama.requests.at(-1)!.think, false) // remembered
  } finally {
    await ollama.close()
  }
})

Deno.test('ollamaTextModel reports an error sent mid-stream', async () => {
  const ollama = fakeOllama(() => ndjson({ error: 'model runner crashed' }))
  try {
    await assertRejects(
      () =>
        ollamaTextModel('m', { baseUrl: ollama.baseUrl }).write(
          { scenario: testScenario, scene: null, action: null },
          new AbortController().signal,
        ),
      Error,
      'model runner crashed',
    )
  } finally {
    await ollama.close()
  }
})
