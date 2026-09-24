import { assertEquals, assertRejects } from '@std/assert'
import { ollamaTextModel } from './textModel.ts'
import { promptWith, testScenario } from './testing.ts'

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

const answer = JSON.stringify({
  outcome: 'done',
  narration: 'She stands.',
  prompt: promptWith('x'),
})

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
      { scenario: testScenario, prompt: null, action: null },
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
    const req = { scenario: testScenario, prompt: null, action: null }
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
          { scenario: testScenario, prompt: null, action: null },
          new AbortController().signal,
        ),
      Error,
      'model runner crashed',
    )
  } finally {
    await ollama.close()
  }
})

Deno.test('ollamaTextModel caps output and fails a reply cut off by the length limit', async () => {
  const ollama = fakeOllama(() =>
    ndjson({ message: { content: '{"outcome": "done", "narr' } }, {
      done: true,
      done_reason: 'length',
    })
  )
  try {
    await assertRejects(
      () =>
        ollamaTextModel('m', { baseUrl: ollama.baseUrl }).write(
          { scenario: testScenario, prompt: null, action: null },
          new AbortController().signal,
        ),
      Error,
      'ran past its length limit',
    )
    const options = ollama.requests[0].options as { num_predict: number }
    assertEquals(options.num_predict, 2048)
  } finally {
    await ollama.close()
  }
})

Deno.test('ollamaTextModel gives up with a readable error when a reply takes too long', async () => {
  const ollama = fakeOllama(() => new Response(new ReadableStream({ start() {} })))
  try {
    const tm = ollamaTextModel('m', {
      baseUrl: ollama.baseUrl,
      timeLimits: { answer: 200, yesNo: 200 },
    })
    await assertRejects(
      () =>
        tm.write(
          { scenario: testScenario, prompt: null, action: null },
          new AbortController().signal,
        ),
      Error,
      "didn't finish within",
    )
    await assertRejects(
      () => tm.namesRealPerson('look like Serena Williams', new AbortController().signal),
      Error,
      "didn't finish within",
    )
  } finally {
    await ollama.close()
  }
})

Deno.test("ollamaTextModel passes the player's Cancel through unchanged", async () => {
  const ollama = fakeOllama(() => new Response(new ReadableStream({ start() {} })))
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new Error('Cancelled by player')), 100)
    await assertRejects(
      () =>
        ollamaTextModel('m', { baseUrl: ollama.baseUrl }).write(
          { scenario: testScenario, prompt: null, action: null },
          controller.signal,
        ),
      Error,
      'Cancelled by player',
    )
  } finally {
    await ollama.close()
  }
})
