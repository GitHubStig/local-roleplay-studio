import { createHandler } from './app.ts'
import { placeholderImageGenerator } from './imageGenerator.ts'
import { mfluxImageGenerator } from './mflux.ts'
import { listOllamaModels } from './ollama.ts'
import { dirScenarioLibrary } from './scenario.ts'
import { dirSessionStore } from './session.ts'
import { fileSettingsStore } from './settings.ts'
import { ollamaTextModel } from './textModel.ts'
import { voiceService } from './voice.ts'

const port = Number(Deno.env.get('PORT') ?? 8787)

const handler = createHandler({
  settings: fileSettingsStore(new URL('../settings.json', import.meta.url)),
  listTextModels: () => listOllamaModels(),
  scenarios: dirScenarioLibrary(new URL('../scenarios/', import.meta.url)),
  sessions: dirSessionStore(new URL('../sessions/', import.meta.url)),
  textModel: (model, think) => ollamaTextModel(model, { think }),
  // IMAGE_GENERATOR=placeholder renders SVG cards instead, for working without mflux.
  imageGenerator: Deno.env.get('IMAGE_GENERATOR') === 'placeholder'
    ? placeholderImageGenerator()
    : mfluxImageGenerator(),
  // VOICES=off leaves Roleplays silent, for working without the voice service.
  voice: Deno.env.get('VOICES') === 'off' ? undefined : voiceService(),
})

Deno.serve({ port }, handler)
