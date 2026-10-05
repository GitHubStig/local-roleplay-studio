import { assertEquals } from '@std/assert'
import { isTextModel, unloadOllamaModels } from './ollama.ts'

const chat = ['completion', 'vision', 'tools', 'thinking']

Deno.test('isTextModel keeps plain and multimodal chat models', () => {
  assertEquals(isTextModel({ name: 'llama3:latest', capabilities: ['completion'] }), true)
  assertEquals(isTextModel({ name: 'gemma4:31b-mlx', capabilities: chat }), true)
  assertEquals(isTextModel({ name: 'muse-glimmer:30b-mlx', capabilities: chat }), true)
})

Deno.test('isTextModel drops OCR models', () => {
  const caps = ['completion', 'vision']
  assertEquals(isTextModel({ name: 'deepseek-ocr:latest', capabilities: caps }), false)
  assertEquals(isTextModel({ name: 'glm-ocr:latest', capabilities: caps }), false)
  assertEquals(isTextModel({ name: 'custom:1b', capabilities: caps, families: ['glmocr'] }), false)
})

Deno.test('isTextModel drops dedicated vision-language models', () => {
  assertEquals(isTextModel({ name: 'qwen3-vl:4b', capabilities: chat }), false)
  assertEquals(
    isTextModel({ name: 'renamed:4b', capabilities: chat, families: ['qwen3vl'] }),
    false,
  )
})

Deno.test('isTextModel drops models that cannot generate text', () => {
  assertEquals(isTextModel({ name: 'nomic-embed-text', capabilities: ['embedding'] }), false)
})

Deno.test('isTextModel keeps a model whose details could not be read', () => {
  assertEquals(isTextModel({ name: 'llama3:text' }), true)
})

Deno.test('unloadOllamaModels unloads every loaded model and waits until none are', async () => {
  let loaded = ['heretic:latest', 'gemma4:31b']
  const unloads: unknown[] = []
  const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    if (new URL(req.url).pathname === '/api/ps') {
      return Response.json({ models: loaded.map((name) => ({ name })) })
    }
    const body = await req.json()
    unloads.push(body)
    // Ollama drops it a moment after answering.
    setTimeout(() => (loaded = loaded.filter((m) => m !== body.model)), 50)
    return Response.json({ done: true, done_reason: 'unload' })
  })
  try {
    await unloadOllamaModels(`http://localhost:${server.addr.port}`)
    assertEquals(unloads, [
      { model: 'heretic:latest', keep_alive: 0 },
      { model: 'gemma4:31b', keep_alive: 0 },
    ])
    assertEquals(loaded, [])
  } finally {
    await server.shutdown()
  }
})
