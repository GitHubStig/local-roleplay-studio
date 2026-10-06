import { createHandler } from './app.ts'
import { placeholderImageGenerator } from './imageGenerator.ts'
import { fromFileUrl } from '@std/path'
import { mfluxImageGenerator, mfluxQuantizedStore } from './mflux.ts'
import { dirScenarioLibrary } from './scenario.ts'
import { dirSessionStore } from './session.ts'
import { fileSettingsStore } from './settings.ts'
import { chatTextModel } from './textModel.ts'
import { chatRoleplayModel } from './roleplay/model.ts'
import { connectionOf, textBackend, type TextConnection } from './text/backend.ts'
import { litoFigureMaker, tripoFigureMaker } from './figure.ts'
import { sharpSceneMaker } from './scene.ts'
import { voiceService } from './voice.ts'
import { detectFeatures, FEATURE_NAMES, FEATURES, thisMachine } from './features.ts'

const port = Number(Deno.env.get('PORT') ?? 8787)

// Saved 8-bit (or 4-bit) copies of Image Models, in the project (gitignored): 13-22 GB each, made
// by this app, so they go when it does.
const quantized = mfluxQuantizedStore(fromFileUrl(new URL('../models/quantized/', import.meta.url)))

// What this machine can run, worked out once: a backend it can't run isn't set up at all, and
// Settings says why (`features.ts`). IMAGE_GENERATOR=placeholder renders SVG cards instead of
// running mflux, for working without it.
const placeholderImages = Deno.env.get('IMAGE_GENERATOR') === 'placeholder'
const features = await detectFeatures(thisMachine(), { placeholderImages })
for (const feature of FEATURES) {
  const { available, reason } = features[feature]
  console.log(`${FEATURE_NAMES[feature]}: ${available ? 'available' : `not available (${reason})`}`)
}

const settings = fileSettingsStore(new URL('../settings.json', import.meta.url))
// The Text backend a Session or Settings names, with the saved API key unless given another.
const text = (connection: TextConnection, apiKey?: string) =>
  textBackend(
    connection,
    () => apiKey !== undefined ? Promise.resolve(apiKey) : settings.loadApiKey(),
  )

const handler = createHandler({
  settings,
  listTextModels: (connection, apiKey) => text(connection, apiKey).listModels(),
  scenarios: dirScenarioLibrary(new URL('../scenarios/', import.meta.url)),
  sessions: dirSessionStore(new URL('../sessions/', import.meta.url)),
  textModel: (c) => chatTextModel(text(c).chat(c.model, c.thinking)),
  roleplayModel: (c) => chatRoleplayModel(text(c).chat(c.model, c.thinking)),
  imageGenerator: placeholderImages
    ? placeholderImageGenerator()
    : mfluxImageGenerator({ quantized }),
  features,
  quantized,
  // A big render next to a loaded Text Model pushes a 48 GB Mac into swap (375 s instead of 66 s
  // for Qwen-Image 2.1 at 1024 px), so each render, upscale, scene and figure unloads it first,
  // where the Text backend can (Ollama; not a server on the OpenAI API).
  freeMemory: async () => {
    await text(connectionOf(await settings.load())).freeMemory?.()
  },
  voice: features.voices.available ? voiceService() : undefined,
  scene: features.scenes.available ? sharpSceneMaker() : undefined,
  figure: features.figures.available ? tripoFigureMaker() : undefined,
  lito: features.lito.available ? litoFigureMaker() : undefined,
})

Deno.serve({ port }, handler)
