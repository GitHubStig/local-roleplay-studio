import { createHandler } from './app.ts'
import { listOllamaModels } from './ollama.ts'
import { fileSettingsStore } from './settings.ts'

const port = Number(Deno.env.get('PORT') ?? 8787)

const handler = createHandler({
  settings: fileSettingsStore(new URL('../settings.json', import.meta.url)),
  listTextModels: () => listOllamaModels(),
})

Deno.serve({ port }, handler)
