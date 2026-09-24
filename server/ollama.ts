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

/** Names of the installed Ollama models usable as a Text Model, e.g. `llama3:latest`. */
export async function listOllamaModels(baseUrl = OLLAMA_URL): Promise<string[]> {
  const res = await fetch(new URL('/api/tags', baseUrl))
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`)
  const body = await res.json() as { models?: { name: string }[] }
  const models = await Promise.all((body.models ?? []).map((m) => showModel(baseUrl, m.name)))
  return models.filter(isTextModel).map((m) => m.name).sort()
}
