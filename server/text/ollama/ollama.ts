import type { TextBackend, TextModelInfo } from '../backend.ts'
import { type Chat, lengthError, THINKING_TOKENS } from '../chat.ts'
import { ndjson } from '../streams.ts'

/**
 * Ollama, through its own API rather than its OpenAI one: it has the thinking switch, model
 * capabilities, and unloading, which the OpenAI API doesn't.
 */
export const OLLAMA_URL = Deno.env.get('OLLAMA_HOST') ?? 'http://localhost:11434'

/**
 * Ollama's answer when the process running a model died while loading it. Seen on a 12 GB card
 * (2026-10-08) when the Text Model loaded just as ComfyUI stopped TTS Audio Suite's VoiceDesign
 * worker ("llama-server process has terminated: exit status 0xc0000409 … CUDA error: shared object
 * initialization failed"); the same load a few seconds later went through.
 */
const LOAD_FAILED = /llama-server process has terminated|model runner has unexpectedly stopped/i

export function ollamaBackend(baseUrl = OLLAMA_URL): TextBackend {
  return {
    chat: (model, think) => ollamaChat(model, { think, baseUrl }),
    listModels: () => listOllamaModels(baseUrl),
    freeMemory: () => unloadOllamaModels(baseUrl),
  }
}

/** Streamed `/api/chat` calls to one Ollama model. */
export function ollamaChat(
  model: string,
  opts: { think?: boolean; baseUrl?: string; retryAfterMs?: number } = {},
): Chat {
  const baseUrl = opts.baseUrl ?? OLLAMA_URL
  const retryAfterMs = opts.retryAfterMs ?? 3000
  let think = opts.think ?? false

  function post(body: Record<string, unknown>, signal: AbortSignal) {
    return fetch(new URL('/api/chat', baseUrl), {
      method: 'POST',
      signal,
      body: JSON.stringify({ model, stream: true, ...body }),
    })
  }

  return {
    model,
    get thinks() {
      return think
    },
    async stream(call) {
      const { messages, schema, maxTokens, signal, onThinking, onContent } = call
      let cap = 0
      const body = () => {
        const thinking = think && !call.noThinking
        cap = thinking ? maxTokens + THINKING_TOKENS : maxTokens
        return {
          think: thinking,
          options: {
            ...(call.temperature !== undefined && { temperature: call.temperature }),
            ...(call.seed !== undefined && { seed: call.seed }),
            ...(call.repeatPenalty && {
              repeat_penalty: call.repeatPenalty.penalty,
              repeat_last_n: call.repeatPenalty.lastN,
            }),
            num_predict: cap,
          },
          format: schema,
          messages,
        }
      }
      let res = await post(body(), signal)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        // Models without thinking reject `think: true`; carry on without it.
        if (think && /think/i.test(String(err.error))) {
          think = false
          res = await post(body(), signal)
        } else if (LOAD_FAILED.test(String(err.error))) {
          // Its model process died while loading: once more, after a moment.
          console.warn(`Ollama failed to load ${model}; trying again:`, err.error)
          await new Promise((r) => setTimeout(r, retryAfterMs))
          signal?.throwIfAborted()
          res = await post(body(), signal)
        } else {
          throw new Error(`Ollama: ${err.error ?? res.status}`)
        }
      }
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}))
        throw new Error(`Ollama: ${err.error ?? res.status}`)
      }

      let content = ''
      let thinking = ''
      let stopped = ''
      let tokens = { prompt: 0, reply: 0 }
      for await (const part of ndjson(res.body)) {
        if (part.error) throw new Error(`Ollama: ${part.error}`)
        const message = part.message as { content?: string; thinking?: string } | undefined
        if (message?.thinking) {
          thinking += message.thinking
          onThinking?.(message.thinking)
        }
        if (message?.content) {
          content += message.content
          onContent?.(message.content)
        }
        if (part.done) {
          stopped = String(part.done_reason ?? '')
          tokens = {
            prompt: Number(part.prompt_eval_count ?? 0),
            reply: Number(part.eval_count ?? 0),
          }
        }
      }
      // On Ollama's GGUF engine an overlong chat loses its oldest exchanges and fills the context
      // to the brim, leaving the reply short of its cap (docs/open-threads.md).
      if (stopped === 'length') throw lengthError(tokens, cap)
      return { content, thinking: thinking.trim() }
    },
  }
}

export interface OllamaModelInfo {
  name: string
  /** From `/api/show`, e.g. `['completion', 'vision']`; undefined if it could not be read. */
  capabilities?: string[]
  families?: string[]
}

/**
 * Whether a model can serve as the Text Model. OCR and dedicated vision-language models
 * are excluded by name or family; general chat models that merely accept images are kept,
 * since Ollama tags those with `vision` too.
 */
export function isTextModel(model: OllamaModelInfo): boolean {
  if (model.capabilities && !model.capabilities.includes('completion')) return false
  const idents = [model.name, ...(model.families ?? [])]
  return !idents.some((id) => /ocr|vl\b/i.test(id))
}

async function showModel(baseUrl: string, name: string): Promise<OllamaModelInfo> {
  try {
    const res = await fetch(new URL('/api/show', baseUrl), {
      method: 'POST',
      body: JSON.stringify({ model: name }),
    })
    if (!res.ok) return { name }
    const body = await res.json() as {
      capabilities?: string[]
      details?: { families?: string[] | null }
    }
    return { name, capabilities: body.capabilities, families: body.details?.families ?? [] }
  } catch {
    return { name }
  }
}

/** The installed Ollama models usable as a Text Model, by name. */
export async function listOllamaModels(baseUrl = OLLAMA_URL): Promise<TextModelInfo[]> {
  const res = await fetch(new URL('/api/tags', baseUrl))
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`)
  const body = await res.json() as { models?: { name: string }[] }
  const models = await Promise.all((body.models ?? []).map((m) => showModel(baseUrl, m.name)))
  return models
    .filter(isTextModel)
    .map((m) => ({ name: m.name, thinking: m.capabilities?.includes('thinking') ?? false }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Unloads every model Ollama has loaded, and waits (up to `timeoutMs`) until it reports none, so
 * their memory is free. Chat leaves a model loaded 5 minutes after its last use; the next call
 * loads it again.
 */
export async function unloadOllamaModels(baseUrl = OLLAMA_URL, timeoutMs = 10_000): Promise<void> {
  const signal = AbortSignal.timeout(timeoutMs)
  const loaded = async () => {
    const res = await fetch(new URL('/api/ps', baseUrl), { signal })
    if (!res.ok) throw new Error(`Ollama /api/ps: HTTP ${res.status}`)
    const body = (await res.json()) as { models?: { name: string }[] }
    return (body.models ?? []).map((m) => m.name)
  }
  const names = await loaded()
  if (names.length === 0) return
  await Promise.all(names.map(async (model) => {
    const res = await fetch(new URL('/api/generate', baseUrl), {
      method: 'POST',
      body: JSON.stringify({ model, keep_alive: 0 }),
      signal,
    })
    await res.body?.cancel()
  }))
  const deadline = Date.now() + timeoutMs
  while ((await loaded()).length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}
