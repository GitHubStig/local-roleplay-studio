import { assertEquals, assertRejects } from '@std/assert'
import { chatTextModel, type TextModelOptions } from '../../textModel.ts'
import { promptWith, testScenario } from '../../testing.ts'
import { ContextFullError } from '../chat.ts'
import { ollamaChat } from './ollama.ts'

/** A Chain's Text Model on an Ollama at `baseUrl`. */
const ollamaTextModel = (
  model: string,
  opts: { think?: boolean; baseUrl: string } & TextModelOptions,
) => chatTextModel(ollamaChat(model, opts), opts)

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

Deno.test('a Text Model on Ollama streams thinking, then parses the answer', async () => {
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

Deno.test('a Text Model on Ollama retries without thinking for models that cannot think', async () => {
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

Deno.test('a Text Model on Ollama reports an error sent mid-stream', async () => {
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

Deno.test('a Text Model on Ollama caps output and fails a reply cut off by the length limit', async () => {
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

Deno.test('a reply cut off short of its cap says the conversation outgrew the context', async () => {
  // As Ollama's GGUF engine answers an overlong chat at num_ctx 8192: the prompt fills it.
  const ollama = fakeOllama(() =>
    ndjson({ message: { content: '{"outcome": "done", "narr' } }, {
      done: true,
      done_reason: 'length',
      prompt_eval_count: 8002,
      eval_count: 190,
    })
  )
  try {
    await assertRejects(
      () =>
        ollamaTextModel('m', { baseUrl: ollama.baseUrl }).write(
          { scenario: testScenario, prompt: null, action: null },
          new AbortController().signal,
        ),
      ContextFullError,
      "no longer fits the Text Model's context (8192 tokens)",
    )
  } finally {
    await ollama.close()
  }
})

Deno.test('a Text Model on Ollama gives up with a readable error when a reply takes too long', async () => {
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

Deno.test("a Text Model on Ollama passes the player's Cancel through unchanged", async () => {
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

Deno.test('A model whose process died while loading is loaded once more, after a moment', async () => {
  const died = 'llama-server process has terminated: exit status 0xc0000409: CUDA error'
  let calls = 0
  const ollama = fakeOllama(() =>
    ++calls === 1
      ? Response.json({ error: died }, { status: 500 })
      : ndjson({ message: { content: 'Fine.' }, done: true, done_reason: 'stop' })
  )
  try {
    let content = ''
    await ollamaChat('m', { baseUrl: ollama.baseUrl, retryAfterMs: 10 }).stream({
      messages: [{ role: 'user', content: 'Hi.' }],
      maxTokens: 50,
      signal: new AbortController().signal,
      onContent: (c) => (content += c),
    })
    assertEquals([calls, content], [2, 'Fine.'])
  } finally {
    await ollama.close()
  }
  // Twice in a row, it fails, saying why.
  const dead = fakeOllama(() => Response.json({ error: died }, { status: 500 }))
  try {
    await assertRejects(
      () =>
        ollamaChat('m', { baseUrl: dead.baseUrl, retryAfterMs: 10 }).stream({
          messages: [{ role: 'user', content: 'Hi.' }],
          maxTokens: 50,
          signal: new AbortController().signal,
        }),
      Error,
      'llama-server process has terminated',
    )
    assertEquals(dead.requests.length, 2)
  } finally {
    await dead.close()
  }
})
