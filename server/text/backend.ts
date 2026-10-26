import type { Backend } from '../backends.ts'
import type { Chat } from './chat.ts'
import type { Seeding } from './seeded.ts'
import { ollamaBackend } from './ollama/ollama.ts'
import { openAiBackend } from './openai/openai.ts'

/**
 * Where the Text Model runs: Ollama's own API, or any server with the OpenAI chat API (LM Studio,
 * llama.cpp's server, vLLM, OpenAI, OpenRouter…).
 */
export const TEXT_BACKENDS = ['ollama', 'openai'] as const
export type TextBackendKind = (typeof TEXT_BACKENDS)[number]

/** Which backend, and where: '' for its default address (Ollama's; required for `openai`). */
export interface TextConnection {
  backend: TextBackendKind
  baseUrl: string
}

/**
 * A Text Model, with thinking on or off, seeded from a Session's seed if given; it runs on the
 * Backend Settings send it to (`textBackendFor`).
 */
export interface TextChoice {
  model: string
  thinking: boolean
  seeding?: Seeding
}

export interface TextModelInfo {
  /** e.g. `llama3:latest` */
  name: string
  /** Can reason before answering (true when the backend can't tell). */
  thinking: boolean
}

export interface TextBackend {
  /** A chat with one of its models; `think` asks it to reason first. */
  chat(model: string, think: boolean): Chat
  /** The models it offers that can serve as the Text Model, by name. */
  listModels(): Promise<TextModelInfo[]>
  /** Unloads its models so a render has the memory; left out where that's not possible. */
  freeMemory?(): Promise<void>
}

/** The backend a connection names. `apiKey` is read for each request, so a new key applies. */
export function textBackend(
  connection: TextConnection,
  apiKey: () => Promise<string>,
): TextBackend {
  return connection.backend === 'openai'
    ? openAiBackend({ baseUrl: connection.baseUrl, apiKey })
    : ollamaBackend(connection.baseUrl || undefined)
}

/** How to reach a text Backend (`backends.ts`): an Ollama or an OpenAI-compatible server. */
export const connectionOf = (backend: Backend): TextConnection => ({
  backend: backend.kind as TextBackendKind,
  baseUrl: backend.address,
})
