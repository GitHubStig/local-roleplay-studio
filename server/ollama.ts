export const OLLAMA_URL = Deno.env.get('OLLAMA_HOST') ?? 'http://localhost:11434'

/** Names of the models installed in Ollama, e.g. `llama3:latest`. */
export async function listOllamaModels(baseUrl = OLLAMA_URL): Promise<string[]> {
  const res = await fetch(new URL('/api/tags', baseUrl))
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`)
  const body = await res.json() as { models?: { name: string }[] }
  return (body.models ?? []).map((m) => m.name).sort()
}
