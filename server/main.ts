import { createHandler } from './app.ts'
import { placeholderImageGenerator } from './images/imageGenerator.ts'
import { fromFileUrl } from '@std/path'
import { mfluxImageGenerator, mfluxQuantizedStore } from './images/mflux/mflux.ts'
import { comfyuiImageGenerator } from './images/comfyui/comfyui.ts'
import { comfyuiStatus } from './comfyui/status.ts'
import { imageBackends } from './images/backend.ts'
import { dirScenarioLibrary } from './scenario.ts'
import { dirSessionStore } from './session.ts'
import { fileSettingsStore, machineDefaults, type Settings } from './settings.ts'
import { chatTextModel } from './textModel.ts'
import { chatRoleplayModel } from './roleplay/model.ts'
import { connectionOf, textBackend, type TextConnection } from './text/backend.ts'
import { litoFigureMaker, tripoFigureMaker } from './3d/figure.ts'
import { sharpSceneMaker } from './3d/scene.ts'
import { voiceBackends, voiceService } from './voice/voice.ts'
import { comfyuiVoiceEngine } from './voice/comfyui/comfyui.ts'
import {
  detectFeatures,
  type Feature,
  FEATURE_NAMES,
  FEATURES,
  thisMachine,
  withBackends,
} from './features.ts'
import { comfyBase } from './comfyui/client.ts'

const port = Number(Deno.env.get('PORT') ?? 8787)

// Saved 8-bit (or 4-bit) copies of Image Models, in the project (gitignored): 13-22 GB each, made
// by this app, so they go when it does.
const quantized = mfluxQuantizedStore(fromFileUrl(new URL('../models/quantized/', import.meta.url)))

// What this machine can run, worked out once: a backend it can't run isn't set up at all, and
// Settings says why (`features.ts`). IMAGE_GENERATOR=placeholder renders SVG cards instead of
// running mflux, for working without it.
const placeholderImages = Deno.env.get('IMAGE_GENERATOR') === 'placeholder'
const features = await detectFeatures(thisMachine(), { placeholderImages })

// Where mflux or the voice service can't run (a PC), Settings default to ComfyUI.
const settings = fileSettingsStore(
  new URL('../settings.json', import.meta.url),
  machineDefaults({ mflux: features.images.available, voiceService: features.voices.available }),
)
await logFeatures(await settings.load())
// The Text backend a Session or Settings names, with the saved API key unless given another.
const text = (connection: TextConnection, apiKey?: string) =>
  textBackend(
    connection,
    () => apiKey !== undefined ? Promise.resolve(apiKey) : settings.loadApiKey(),
  )

const handler = createHandler({
  settings,
  listTextModels: (connection, apiKey) => text(connection, apiKey).listModels(),
  comfyuiStatus,
  scenarios: dirScenarioLibrary(new URL('../scenarios/', import.meta.url)),
  sessions: dirSessionStore(new URL('../sessions/', import.meta.url)),
  textModel: (c) => chatTextModel(text(c).chat(c.model, c.thinking)),
  roleplayModel: (c) => chatRoleplayModel(text(c).chat(c.model, c.thinking)),
  // Each Session renders with the backend its Settings name: mflux where it's installed (a Mac),
  // or ComfyUI (any machine). Upscale runs where Settings say now, with ComfyUI's address there.
  imageGenerator: placeholderImages ? placeholderImageGenerator() : imageBackends({
    mflux: features.images.available ? mfluxImageGenerator({ quantized }) : undefined,
    comfyui: comfyuiImageGenerator({
      upscaleUrl: async () => (await settings.load()).imageBaseUrl,
    }),
    upscaleBackend: async () => (await settings.load()).upscaleBackend,
  }),
  features,
  quantized,
  // A big render next to a loaded Text Model pushes a 48 GB Mac into swap (375 s instead of 66 s
  // for Qwen-Image 2.1 at 1024 px), so each render, upscale, scene and figure unloads it first,
  // where the Text backend can (Ollama; not a server on the OpenAI API).
  freeMemory: async () => {
    await text(connectionOf(await settings.load())).freeMemory?.()
  },
  // Voices with the backend Settings choose now: the voice service where it runs (a Mac), or the
  // ComfyUI at Settings' address with TTS Audio Suite's nodes.
  voice: voiceBackends({
    mlx: features.voices.available ? voiceService() : undefined,
    comfyui: comfyuiVoiceEngine({ baseUrl: async () => (await settings.load()).imageBaseUrl }),
    voiceBackend: async () => (await settings.load()).voiceBackend,
  }),
  scene: features.scenes.available ? sharpSceneMaker() : undefined,
  figure: features.figures.available ? tripoFigureMaker() : undefined,
  lito: features.lito.available ? litoFigureMaker() : undefined,
})

Deno.serve({ port }, handler)

/**
 * Says at startup what can run with the saved Settings, and on what (Settings shows the same, as it
 * changes); and when anything is sent to ComfyUI, whether it answers and has what it needs.
 */
async function logFeatures(saved: Settings) {
  const comfy = `ComfyUI at ${comfyBase(saved.imageBaseUrl)}`
  const on: Partial<Record<Feature, string>> = {
    images: placeholderImages ? 'placeholders' : saved.imageBackend === 'comfyui' ? comfy : 'mflux',
    upscale: saved.upscaleBackend === 'comfyui' ? comfy : 'mflux',
    voices: saved.voiceBackend === 'comfyui' ? comfy : 'the voice service',
  }
  const now = withBackends(features, saved)
  for (const feature of FEATURES) {
    const { available, reason } = now[feature]
    const where = on[feature] ? ` (${on[feature]})` : ''
    console.log(
      `${FEATURE_NAMES[feature]}: ${available ? `available${where}` : `not available (${reason})`}`,
    )
  }
  const voices = saved.voiceBackend === 'comfyui'
  if (saved.imageBackend !== 'comfyui' && saved.upscaleBackend !== 'comfyui' && !voices) return
  const status = await comfyuiStatus(saved.imageBaseUrl, {
    imageModel: saved.imageBackend === 'comfyui' ? saved.imageModel : undefined,
    upscaler: saved.upscaleBackend === 'comfyui' ? saved.upscaler : undefined,
    voices,
  })
  console.log(
    !status.up
      ? `ComfyUI: not answering at ${
        comfyBase(saved.imageBaseUrl)
      }; start it before rendering or speaking`
      : status.ready
      ? `ComfyUI: up, ${status.version} on ${status.device}, with what Settings send it`
      : `ComfyUI: up (${status.version}), but ${status.missing}`,
  )
}
