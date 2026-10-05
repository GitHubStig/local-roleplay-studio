export const OLLAMA_URL = Deno.env.get('OLLAMA_HOST') ?? 'http://localhost:11434'

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

export interface TextModelInfo {
  /** e.g. `llama3:latest` */
  name: string
  /** Can reason before answering (Ollama's `thinking` capability). */
  thinking: boolean
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
