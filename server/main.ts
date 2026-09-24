import { createHandler } from './app.ts'
import { placeholderImageGenerator } from './imageGenerator.ts'
import { listOllamaModels } from './ollama.ts'
import { dirScenarioLibrary } from './scenario.ts'
import { dirSessionStore } from './session.ts'
import { fileSettingsStore } from './settings.ts'
import { ollamaTextModel } from './textModel.ts'

const port = Number(Deno.env.get('PORT') ?? 8787)

const handler = createHandler({
  settings: fileSettingsStore(new URL('../settings.json', import.meta.url)),
  listTextModels: () => listOllamaModels(),
  scenarios: dirScenarioLibrary(new URL('../scenarios/', import.meta.url)),
  sessions: dirSessionStore(new URL('../sessions/', import.meta.url)),
  textModel: (model) => ollamaTextModel(model),
  imageGenerator: placeholderImageGenerator(),
})

Deno.serve({ port }, handler)
