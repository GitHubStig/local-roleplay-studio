import { createHandler } from './app.ts'
import { placeholderImageGenerator } from './imageGenerator.ts'
import { fromFileUrl } from '@std/path'
import { mfluxImageGenerator, mfluxQuantizedStore } from './mflux.ts'
import { listOllamaModels } from './ollama.ts'
import { dirScenarioLibrary } from './scenario.ts'
import { dirSessionStore } from './session.ts'
import { fileSettingsStore } from './settings.ts'
import { ollamaTextModel } from './textModel.ts'
import { litoFigureMaker, tripoFigureMaker } from './figure.ts'
import { sharpSceneMaker } from './scene.ts'
import { voiceService } from './voice.ts'

const port = Number(Deno.env.get('PORT') ?? 8787)

// Saved 8-bit (or 4-bit) copies of Image Models, in the project (gitignored): 13-22 GB each, made
// by this app, so they go when it does.
const quantized = mfluxQuantizedStore(fromFileUrl(new URL('../models/quantized/', import.meta.url)))

const handler = createHandler({
  settings: fileSettingsStore(new URL('../settings.json', import.meta.url)),
  listTextModels: () => listOllamaModels(),
  scenarios: dirScenarioLibrary(new URL('../scenarios/', import.meta.url)),
  sessions: dirSessionStore(new URL('../sessions/', import.meta.url)),
  textModel: (model, think) => ollamaTextModel(model, { think }),
  // IMAGE_GENERATOR=placeholder renders SVG cards instead, for working without mflux.
  imageGenerator: Deno.env.get('IMAGE_GENERATOR') === 'placeholder'
    ? placeholderImageGenerator()
    : mfluxImageGenerator({ quantized }),
  quantized,
  // VOICES=off leaves Roleplays silent, for working without the voice service.
  voice: Deno.env.get('VOICES') === 'off' ? undefined : voiceService(),
  // SCENES=off leaves pictures flat, for working without SHARP.
  scene: Deno.env.get('SCENES') === 'off' ? undefined : sharpSceneMaker(),
  // FIGURES=off runs without TripoSplat.
  figure: Deno.env.get('FIGURES') === 'off' ? undefined : tripoFigureMaker(),
  // LITO=off runs without Apple's LiTo.
  lito: Deno.env.get('LITO') === 'off' ? undefined : litoFigureMaker(),
})

Deno.serve({ port }, handler)
