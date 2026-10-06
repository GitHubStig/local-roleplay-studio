import type { TextBackend, TextModelInfo } from '../backend.ts'
import { type Chat, LENGTH_LIMIT_ERROR, THINKING_TOKENS } from '../chat.ts'
import { sseData } from '../streams.ts'

/**
 * Any server with the OpenAI chat API: LM Studio, llama.cpp's server, vLLM, Ollama's `/v1`, and
 * cloud services (OpenAI, OpenRouter…). `baseUrl` includes the API's version, as each documents it
 * (`http://localhost:1234/v1`, `https://openrouter.ai/api/v1`).
 *
 * Servers differ beyond the core of the API; see `openAiChat` for how each difference is met.
 */
export function openAiBackend(opts: {
  baseUrl: string
  /** '' for a server that needs none (most local ones). */
  apiKey: () => Promise<string>
}): TextBackend {
  const base = opts.baseUrl.trim().replace(/\/+$/, '')
  const request = async (path: string, init: RequestInit = {}) => {
    if (!base) throw new Error("Set the OpenAI-compatible server's address in Settings")
    const key = await opts.apiKey()
    return fetch(`${base}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(key && { authorization: `Bearer ${key}` }),
      },
    })
  }
  return {
    chat: (model, think) => openAiChat(model, think, request),
    async listModels() {
      const res = await request('/models')
      if (!res.ok) throw new Error(await errorOf(res))
      const body = await res.json() as { data?: { id: string }[] }
      return (body.data ?? [])
        .map((m) => m.id)
        .filter(isChatModel)
        .sort((a, b) => a.localeCompare(b))
        // The API doesn't say which models can think: offer it, and `openAiChat` turns it off
        // for one that refuses.
        .map((name): TextModelInfo => ({ name, thinking: true }))
    },
  }
}

/** Whether a listed model can chat: cloud services list their image, audio and embedding ones too. */
export function isChatModel(id: string): boolean {
  return !/embed|whisper|tts|dall-e|gpt-image|moderation|audio|realtime|transcribe|sora|rerank/i
    .test(id)
}

const LABEL = 'Text server'

/**
 * Streamed `/chat/completions` calls to one model. Fields outside the API's core, which a server
 * may refuse, are dropped one at a time when one is named in a refusal, and stay dropped:
 * - `reasoning_effort`: turns thinking on ("medium") or off ("none"). Sent even with thinking off,
 *   as thinking models reason by default (gemma4 on Ollama's `/v1` does).
 * - `repeat_penalty` and `repeat_last_n` (llama.cpp's and LM Studio's names): the Replies' guard
 *   against repeating themselves. Cloud services have no equivalent.
 * - `max_tokens`: OpenAI's reasoning models want `max_completion_tokens` instead.
 */
export function openAiChat(
  model: string,
  think: boolean,
  request: (path: string, init: RequestInit) => Promise<Response>,
): Chat {
  let effort = true
  let penalty = true
  let tokensField = 'max_tokens'
  const fallbacks = [
    {
      refused: /reasoning/i,
      applies: () => effort,
      drop: () => {
        effort = false
        think = false
      },
    },
    { refused: /repeat_/i, applies: () => penalty, drop: () => (penalty = false) },
    {
      refused: /max_tokens/i,
      applies: () => tokensField === 'max_tokens',
      drop: () => (tokensField = 'max_completion_tokens'),
    },
  ]

  return {
    model,
    get thinks() {
      return think
    },
    async stream(call) {
      const { messages, schema, maxTokens, signal, onThinking, onContent } = call
      const body = () => {
        const thinking = think && !call.noThinking
        return {
          model,
          stream: true,
          messages,
          [tokensField]: thinking ? maxTokens + THINKING_TOKENS : maxTokens,
          ...(effort && { reasoning_effort: thinking ? 'medium' : 'none' }),
          ...(schema && {
            response_format: { type: 'json_schema', json_schema: { name: 'answer', schema } },
          }),
          ...(call.temperature !== undefined && { temperature: call.temperature }),
          ...(penalty && call.repeatPenalty && {
            repeat_penalty: call.repeatPenalty.penalty,
            repeat_last_n: call.repeatPenalty.lastN,
          }),
        }
      }
      const post = () =>
        request('/chat/completions', { method: 'POST', signal, body: JSON.stringify(body()) })

      let res = await post()
      while (!res.ok) {
        const message = await errorOf(res)
        const fallback = res.status < 500 &&
          fallbacks.find((f) => f.applies() && f.refused.test(message))
        if (!fallback) throw new Error(message)
        fallback.drop()
        res = await post()
      }
      if (!res.body) throw new Error(`${LABEL}: no reply`)

      let content = ''
      let thinking = ''
      let stopped = ''
      for await (const part of sseData(res.body)) {
        if (part.error) throw new Error(`${LABEL}: ${messageOf(part.error)}`)
        const choice = (part.choices as Choice[] | undefined)?.[0]
        if (!choice) continue
        // Ollama and OpenRouter call it `reasoning`; llama.cpp, LM Studio and DeepSeek
        // `reasoning_content`.
        const reasoning = choice.delta?.reasoning ?? choice.delta?.reasoning_content
        if (typeof reasoning === 'string' && reasoning) {
          thinking += reasoning
          onThinking?.(reasoning)
        }
        const text = choice.delta?.content
        if (typeof text === 'string' && text) {
          content += text
          onContent?.(text)
        }
        if (choice.finish_reason) stopped = choice.finish_reason
      }
      if (stopped === 'length') throw new Error(LENGTH_LIMIT_ERROR)
      return { content, thinking: thinking.trim() }
    },
  }
}

interface Choice {
  delta?: { content?: unknown; reasoning?: unknown; reasoning_content?: unknown }
  finish_reason?: string | null
}

/** An error body's message: `{error: {message}}` from most servers, `{error: "…"}` from some. */
function messageOf(error: unknown): string {
  if (typeof error === 'string') return error
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' ? message : JSON.stringify(error)
}

async function errorOf(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  let detail = text.trim().slice(0, 300) || `HTTP ${res.status}`
  try {
    const body = JSON.parse(text)
    detail = messageOf(body.error ?? body.message ?? body.detail ?? body)
  } catch {
    // Not JSON: keep the text.
  }
  return `${LABEL}: ${detail}`
}
