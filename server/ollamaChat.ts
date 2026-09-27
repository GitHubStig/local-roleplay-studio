import { OLLAMA_URL } from './ollama.ts'

/** One message of a chat with the Text Model. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCall {
  messages: ChatMessage[]
  /** JSON schema the reply must follow (Ollama's structured output). */
  format: object
  /** Token cap for the reply; thinking gets `thinkingTokens` on top when it's on. */
  maxTokens: number
  /** Other Ollama sampling options, e.g. `repeat_penalty`. */
  options?: Record<string, number>
  signal: AbortSignal
  onThinking?: (chunk: string) => void
  onContent?: (chunk: string) => void
}

export interface OllamaChat {
  /**
   * One streamed chat call: returns the whole reply and any reasoning, passing both on as they
   * arrive. Retries once without thinking if the model can't think, and from then on leaves it
   * off; fails if the reply was cut off by its token cap.
   */
  stream(call: ChatCall): Promise<{ content: string; thinking: string }>
  /** Whether thinking is on: asked for, and not turned off because the model can't. */
  readonly thinks: boolean
}

/** Splits an NDJSON byte stream into parsed objects. */
export async function* ndjson(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  let buffer = ''
  for await (const chunk of body.pipeThrough(new TextDecoderStream())) {
    buffer += chunk
    let end: number
    while ((end = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, end).trim()
      buffer = buffer.slice(end + 1)
      if (line) yield JSON.parse(line)
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer)
}

/**
 * Runs `task` with `signal` plus a time limit. A time-limit abort becomes a readable error; the
 * player's own Cancel (on `signal`) is rethrown unchanged.
 */
export async function within<T>(
  signal: AbortSignal,
  ms: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const limit = AbortSignal.timeout(ms)
  try {
    return await task(AbortSignal.any([signal, limit]))
  } catch (err) {
    if (!signal.aborted && limit.aborted) {
      throw new Error(`The Text Model didn't finish within ${Math.round(ms / 1000)} s`)
    }
    throw err
  }
}

/** Streamed `/api/chat` calls to one Ollama model. */
export function ollamaChat(
  model: string,
  opts: { think?: boolean; baseUrl?: string; thinkingTokens: number },
): OllamaChat {
  const baseUrl = opts.baseUrl ?? OLLAMA_URL
  let think = opts.think ?? false

  function post(body: Record<string, unknown>, signal: AbortSignal) {
    return fetch(new URL('/api/chat', baseUrl), {
      method: 'POST',
      signal,
      body: JSON.stringify({ model, stream: true, think, ...body }),
    })
  }

  return {
    get thinks() {
      return think
    },
    async stream({ messages, format, maxTokens, options, signal, onThinking, onContent }) {
      const body = () => ({
        options: {
          ...options,
          num_predict: think ? maxTokens + opts.thinkingTokens : maxTokens,
        },
        format,
        messages,
      })
      let res = await post(body(), signal)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        // Models without thinking reject `think: true`; carry on without it.
        if (think && /think/i.test(String(err.error))) {
          think = false
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
        if (part.done) stopped = String(part.done_reason ?? '')
      }
      if (stopped === 'length') throw new Error('The Text Model ran past its length limit')
      return { content, thinking: thinking.trim() }
    },
  }
}
