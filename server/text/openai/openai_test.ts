import { assertEquals, assertRejects } from '@std/assert'
import { chatRoleplayModel } from '../../roleplay/model.ts'
import { chatTextModel } from '../../textModel.ts'
import { promptWith, testScenario } from '../../testing.ts'
import { ContextFullError } from '../chat.ts'
import { seededChat } from '../seeded.ts'
import { openAiBackend } from './openai.ts'

interface Seen {
  path: string
  authorization: string | null
  body: Record<string, unknown>
}

/** A stand-in OpenAI-compatible server, recording each request. */
function fakeServer(respond: (req: Seen) => Response) {
  const seen: Seen[] = []
  const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    const call = {
      path: new URL(req.url).pathname,
      authorization: req.headers.get('authorization'),
      body: req.method === 'POST' ? await req.json() : {},
    }
    seen.push(call)
    return respond(call)
  })
  return {
    backend: (apiKey = '') =>
      openAiBackend({
        baseUrl: `http://localhost:${server.addr.port}/v1/`,
        apiKey: () => Promise.resolve(apiKey),
      }),
    seen,
    close: () => server.shutdown(),
  }
}

/**
 * A streamed reply: each delta in its own event, then the finish, the token counts if given (as
 * `stream_options.include_usage` asks), and `[DONE]`.
 */
const sse = (deltas: object[], finish = 'stop', usage?: object) =>
  new Response(
    [
      ...deltas.map((delta) => ({ choices: [{ delta, finish_reason: null }] })),
      { choices: [{ delta: {}, finish_reason: finish }] },
      ...(usage ? [{ choices: [], usage }] : []),
    ].map((p) => `data: ${JSON.stringify(p)}\n\n`).join('') + 'data: [DONE]\n\n',
  )

const answer = JSON.stringify({
  outcome: 'done',
  narration: 'She stands.',
  prompt: promptWith('x'),
})
const request = { scenario: testScenario, prompt: null, action: null }
const signal = new AbortController().signal

Deno.test('An OpenAI-compatible Text Model streams reasoning, then parses the answer', async () => {
  const server = fakeServer(() =>
    sse([
      { reasoning: 'Hmm, ' }, // Ollama, OpenRouter
      { reasoning_content: 'stand.' }, // llama.cpp, LM Studio
      { content: answer.slice(0, 20) },
      { content: answer.slice(20) },
    ])
  )
  try {
    const chunks: string[] = []
    const text = await chatTextModel(server.backend('sk-1').chat('m', true))
      .write(request, signal, (c) => chunks.push(c))
    assertEquals(chunks, ['Hmm, ', 'stand.'])
    assertEquals(text.thinking, 'Hmm, stand.')
    assertEquals(text.narration, 'She stands.')
    const [call] = server.seen
    assertEquals(call.path, '/v1/chat/completions')
    assertEquals(call.authorization, 'Bearer sk-1')
    assertEquals(call.body.stream, true)
    assertEquals(call.body.reasoning_effort, 'medium')
    assertEquals(call.body.max_tokens, 2048 + 12288)
    assertEquals((call.body.response_format as { type: string }).type, 'json_schema')
  } finally {
    await server.close()
  }
})

Deno.test('Thinking off is asked for, as thinking models reason by default', async () => {
  const server = fakeServer(() => sse([{ content: answer }]))
  try {
    await chatTextModel(server.backend().chat('m', false)).write(request, signal)
    assertEquals(server.seen[0].body.reasoning_effort, 'none')
    assertEquals(server.seen[0].body.max_tokens, 2048)
    assertEquals(server.seen[0].authorization, null) // no key, no header
  } finally {
    await server.close()
  }
})

Deno.test('Fields a server refuses are dropped one at a time, and stay dropped', async () => {
  // As OpenAI answers: it knows neither the repeat penalty nor `max_tokens` for some models.
  const server = fakeServer(({ body }) => {
    const refuse = (message: string) => Response.json({ error: { message } }, { status: 400 })
    if ('repeat_penalty' in body) return refuse('Unrecognized request argument: repeat_penalty')
    if ('seed' in body) return refuse('Unrecognized request argument: seed')
    if ('max_tokens' in body) return refuse("Unsupported parameter: 'max_tokens'")
    return sse([{ content: '{"internal":"","actions":"Kael waits.","dialogue":"Evening."}' }])
  })
  try {
    const chat = seededChat(server.backend().chat('m', false), { session: 'refused', seed: 42 })
    const model = chatRoleplayModel(chat)
    const reply = await model.reply([{ role: 'user', content: 'Hi' }], signal)
    assertEquals(reply.dialogue, 'Evening.')
    assertEquals(server.seen.length, 4)
    assertEquals(server.seen[0].body.repeat_penalty, 1.15)
    assertEquals(server.seen[0].body.repeat_last_n, 131_072)
    assertEquals(typeof server.seen[1].body.seed, 'number')
    assertEquals(server.seen[3].body.max_completion_tokens, 1024)

    await model.reply([{ role: 'user', content: 'Hi' }], signal)
    assertEquals(server.seen.length, 5) // remembered: straight through
  } finally {
    await server.close()
  }
})

Deno.test('A model that refuses reasoning answers without it', async () => {
  const server = fakeServer(({ body }) =>
    'reasoning_effort' in body
      ? Response.json({ error: { message: 'reasoning_effort is not supported' } }, { status: 400 })
      : sse([{ content: answer }])
  )
  try {
    const chat = server.backend().chat('m', true)
    const text = await chatTextModel(chat).write(request, signal)
    assertEquals(text.thinking, undefined)
    assertEquals(chat.thinks, false)
    assertEquals(server.seen[1].body.max_tokens, 2048)
  } finally {
    await server.close()
  }
})

Deno.test('Other refusals, mid-stream errors and cut-off replies fail readably', async () => {
  const replies = [
    Response.json({ error: { message: 'Invalid API key' } }, { status: 401 }),
    new Response(`data: ${JSON.stringify({ error: { message: 'overloaded' } })}\n\n`),
    sse([{ content: '{"outcome": "done", "narr' }], 'length', { completion_tokens: 2048 }),
  ]
  const server = fakeServer(() => replies.shift()!)
  try {
    const model = chatTextModel(server.backend().chat('m', false))
    await assertRejects(() => model.write(request, signal), Error, 'Text server: Invalid API key')
    await assertRejects(() => model.write(request, signal), Error, 'Text server: overloaded')
    await assertRejects(() => model.write(request, signal), Error, 'ran past its length limit')
    assertEquals(server.seen.length, 3) // no retries
  } finally {
    await server.close()
  }
})

Deno.test('A reply cut off short of its cap, by the counts, outgrew the context', async () => {
  // As Ollama's /v1 answers an overlong chat at num_ctx 8192 (2026-10-06).
  const counts = { prompt_tokens: 7966, completion_tokens: 226, total_tokens: 8192 }
  const replies = [
    // A server that refuses the counts: dropped, and asked again.
    Response.json({ error: { message: "Unknown field 'stream_options'" } }, { status: 400 }),
    sse([{ content: '{"outcome": "done", "narr' }], 'length', counts),
  ]
  const server = fakeServer(() => replies.shift()!)
  try {
    await assertRejects(
      () => chatTextModel(server.backend().chat('m', false)).write(request, signal),
      ContextFullError,
      '(8192 tokens)',
    )
    assertEquals(server.seen[0].body.stream_options, { include_usage: true })
    assertEquals('stream_options' in server.seen[1].body, false)
  } finally {
    await server.close()
  }
})

Deno.test('Listing keeps the chat models, with the key', async () => {
  const server = fakeServer(() =>
    Response.json({
      data: [
        { id: 'gpt-5-mini' },
        { id: 'text-embedding-3-small' },
        { id: 'whisper-1' },
        { id: 'gemma-4-26b-heretic' },
      ],
    })
  )
  try {
    assertEquals(await server.backend('sk-1').listModels(), [
      { name: 'gemma-4-26b-heretic', thinking: true },
      { name: 'gpt-5-mini', thinking: true },
    ])
    assertEquals(server.seen[0].path, '/v1/models')
    assertEquals(server.seen[0].authorization, 'Bearer sk-1')
  } finally {
    await server.close()
  }
})

Deno.test('Without an address, it says to set one', async () => {
  const backend = openAiBackend({ baseUrl: '', apiKey: () => Promise.resolve('') })
  await assertRejects(() => backend.listModels(), Error, "server's address")
})
