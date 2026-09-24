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
