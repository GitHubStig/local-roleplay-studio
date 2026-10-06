/**
 * The one way the app talks to a Text Model: a streamed chat call. Every Text backend (`ollama/`,
 * `openai/`) implements `Chat`, and nothing outside this folder knows which one it has, so a
 * backend (or this whole folder, for a library) can be swapped without touching the rest.
 */

/** One message of a chat with the Text Model. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCall {
  messages: ChatMessage[]
  /** JSON schema the reply must follow (structured output); none for plain text. */
  schema?: object
  /** Token cap for the reply; thinking gets `THINKING_TOKENS` on top when it's on. */
  maxTokens: number
  /** Answer straight away even when thinking is on (a quick yes/no question). */
  noThinking?: boolean
  temperature?: number
  /** Penalise repeating any of the last `lastN` tokens (a backend that can't, ignores it). */
  repeatPenalty?: { penalty: number; lastN: number }
  signal: AbortSignal
  onThinking?: (chunk: string) => void
  onContent?: (chunk: string) => void
}

export interface Chat {
  /** The model's name, as its backend knows it. */
  readonly model: string
  /**
   * One streamed chat call: returns the whole reply and any reasoning, passing both on as they
   * arrive. Retries once without thinking if the model can't think, and from then on leaves it
   * off; fails if the reply was cut off by its token cap.
   */
  stream(call: ChatCall): Promise<{ content: string; thinking: string }>
  /** Whether thinking is on: asked for, and not turned off because the model can't. */
  readonly thinks: boolean
}

/** Room for the model's reasoning, on top of a reply's own cap. */
export const THINKING_TOKENS = 12288

export const LENGTH_LIMIT_ERROR = 'The Text Model ran past its length limit'

/**
 * The prompt filled the model's context, leaving the reply no room: the conversation has outgrown
 * the backend's context length. The same call would fail again, so it isn't retried.
 */
export class ContextFullError extends Error {
  constructor(tokens: number) {
    super(
      `The conversation no longer fits the Text Model's context (${tokens} tokens). Raise the ` +
        `context length where the model runs (Ollama: its settings, or OLLAMA_CONTEXT_LENGTH; ` +
        `LM Studio: the model's load settings), as far as it still fits on the GPU.`,
    )
    this.name = 'ContextFullError'
  }
}

/**
 * Why a reply stopped at a length limit: short of its own cap (`cap` tokens), the context ran out;
 * at it, the reply was too long. Without counts (`reply` 0), the length error.
 */
export function lengthError(tokens: { prompt: number; reply: number }, cap: number): Error {
  return tokens.reply > 0 && tokens.reply < cap
    ? new ContextFullError(tokens.prompt + tokens.reply)
    : new Error(LENGTH_LIMIT_ERROR)
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
