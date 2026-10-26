import { fromFileUrl } from '@std/path'
import { createHandler } from './app.ts'
import { type Backend, BACKEND_NAMES, BACKEND_WORK, backendAddress } from './backends.ts'
import { placeholderImageGenerator } from './images/imageGenerator.ts'
import { mfluxImageGenerator } from './images/mflux/mflux.ts'
import { backendOf, editJob, type HeavyJob, sameMachine, textBackendFor } from './machine.ts'
import { comfyuiImageGenerator } from './images/comfyui/comfyui.ts'
import { comfyuiStatus } from './comfyui/status.ts'
import { imageBackends } from './images/backend.ts'
import { dirScenarioLibrary } from './scenario.ts'
import { dirSessionStore } from './session.ts'
import { fileSettingsStore, machineDefaults, type Settings } from './settings.ts'
import { chatTextModel } from './textModel.ts'
import { chatRoleplayModel } from './roleplay/model.ts'
import { connectionOf, textBackend, type TextChoice } from './text/backend.ts'
import type { Chat } from './text/chat.ts'
import { routedChat } from './text/routed.ts'
import { seededChat } from './text/seeded.ts'
import { loggedChat, loggedEmbedder, loggedImages, loggedMaker, loggedVoice } from './calls.ts'
import { litoFigureMaker, tripoFigureMaker } from './3d/figure.ts'
import { sharpSceneMaker } from './3d/scene.ts'
import { uvStyleEmbedder } from './style/embedder.ts'
import { buildComparisonPage } from './export/page.ts'
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

const port = Number(Deno.env.get('PORT') ?? 8787)
const sessionsDir = fromFileUrl(new URL('../sessions/', import.meta.url))

// What this machine can run, worked out once: a backend it can't run isn't set up at all, and
// Settings says why (`features.ts`). IMAGE_GENERATOR=placeholder renders SVG cards instead of
// running mflux, for working without it.
const placeholderImages = Deno.env.get('IMAGE_GENERATOR') === 'placeholder'
const features = await detectFeatures(thisMachine(), { placeholderImages })

// Where mflux or the voice service can't run (a PC), Settings default to a ComfyUI here.
const settings = fileSettingsStore(
  new URL('../settings.json', import.meta.url),
  machineDefaults({ mflux: features.images.available, voiceService: features.voices.available }),
)
await logFeatures(await settings.load())
/** The Backend a heavy job goes to as Settings are now (ADR 0022). */
const backendNow = async (job: HeavyJob) => backendOf(job, await settings.load(), features)
// A text Backend, with its saved API key unless given another.
const text = (backend: Backend, apiKey?: string) =>
  textBackend(
    connectionOf(backend),
    () => apiKey !== undefined ? Promise.resolve(apiKey) : settings.loadApiKey(backend.id),
  )

const listings = new Map<string, Promise<string[]>>()
/**
 * The Text Models a Backend lists, for finding which runs a Session's (`textBackendFor`): kept a
 * minute, so each call doesn't ask again; a failure isn't kept.
 */
function listed(backend: Backend): Promise<string[]> {
  const key = `${backend.id} ${backend.address}`
  const kept = listings.get(key)
  if (kept) return kept
  const names = text(backend).listModels().then((models) => models.map((m) => m.name))
  listings.set(key, names)
  names.then(
    () => setTimeout(() => listings.delete(key), 60_000),
    () => listings.delete(key),
  )
  return names
}
const textBackendOf = async (model: string) => textBackendFor(await settings.load(), model, listed)

/**
 * A chat with the model a choice names, on the Backend Settings send it to at each call, seeded
 * from its Session's seed when it has one.
 */
const chat = (c: TextChoice) => {
  const chats = new Map<string, Chat>()
  const routed = routedChat(c.model, c.thinking, async () => {
    const backend = await textBackendOf(c.model)
    if (!backend) {
      throw new Error('No Backend runs the Text Model: add one in Settings, on the Machines tab')
    }
    const key = `${backend.id} ${backend.address}`
    if (!chats.has(key)) chats.set(key, text(backend).chat(c.model, c.thinking))
    return chats.get(key)!
  })
  // Logged inside the seeding, so the log has each call's seed.
  const plain = loggedChat(routed)
  return c.seeding ? seededChat(plain, c.seeding) : plain
}

const handler = createHandler({
  settings,
  listTextModels: (backend, apiKey) => text(backend, apiKey).listModels(),
  textBackendOf,
  comfyuiStatus,
  scenarios: dirScenarioLibrary(new URL('../scenarios/', import.meta.url)),
  sessions: dirSessionStore(sessionsDir),
  exports: { dir: fromFileUrl(new URL('../exports/', import.meta.url)), page: buildComparisonPage },
  textModel: (c) => chatTextModel(chat(c)),
  roleplayModel: (c) => chatRoleplayModel(chat(c)),
  // Each render, upscale and edit goes to the Backend Settings send it to: this machine's mflux
  // where it's installed (a Mac), or a ComfyUI (any machine).
  imageGenerator: loggedImages(
    placeholderImages ? placeholderImageGenerator() : imageBackends({
      mflux: features.images.available ? mfluxImageGenerator() : undefined,
      comfyui: (address) => comfyuiImageGenerator({ address }),
      backendOf: backendNow,
    }),
  ),
  features,
  // A big render next to a loaded Text Model pushed a 48 GB Mac into swap (375 s instead of 66 s
  // for Qwen-Image 2.1 at 1024 px), so each render, upscale, scene and figure unloads it first,
  // from every text Backend that can (Ollama; not a server on the OpenAI API) on the machine the
  // job runs on: a render on a ComfyUI across the network leaves this one's loaded (ADR 0013).
  freeMemory: async (job) => {
    const now = await settings.load()
    const where = backendOf(job, now, features)
    const machine = where && backendAddress(where)
    const there = now.backends.filter((b) =>
      BACKEND_WORK[b.kind].includes('text') && sameMachine(backendAddress(b), machine)
    )
    await Promise.all(there.map((b) => text(b).freeMemory?.()))
  },
  // Voices on the Backend Settings send them to: this machine's voice service where it runs (a
  // Mac), or a ComfyUI with TTS Audio Suite's nodes.
  voice: voiceBackends({
    mlx: features.voices.available
      ? loggedVoice(voiceService({ root: sessionsDir }), 'mlx-audio')
      : undefined,
    comfyui: (address) => loggedVoice(comfyuiVoiceEngine({ address }), 'comfyui'),
    backend: () => backendNow({ kind: 'voice' }),
  }),
  // Logged like the Text and Image Models' calls (`calls.ts`).
  scene: features.scenes.available ? loggedMaker(sharpSceneMaker(), 'scene', 'SHARP') : undefined,
  figure: features.figures.available
    ? loggedMaker(tripoFigureMaker(), 'figure', 'TripoSplat')
    : undefined,
  lito: features.lito.available ? loggedMaker(litoFigureMaker(), 'lito', 'LiTo') : undefined,
  style: features.style.available ? loggedEmbedder(uvStyleEmbedder()) : undefined,
})

Deno.serve({ port }, handler)

/**
 * Says at startup what can run with the saved Settings, and on which Backend (Settings shows the
 * same, as it changes); and for each ComfyUI something is sent to, whether it answers and has what
 * it needs.
 */
async function logFeatures(saved: Settings) {
  const named = (b: Backend | undefined) =>
    !b
      ? 'no Backend'
      : b.kind === 'here'
      ? 'this machine'
      : `${BACKEND_NAMES[b.kind]} at ${backendAddress(b)}`
  const render = backendOf({ kind: 'render', settings: saved }, saved, features)
  const upscale = backendOf({ kind: 'upscale' }, saved, features)
  const voices = backendOf({ kind: 'voice' }, saved, features)
  const on: Partial<Record<Feature, string>> = {
    images: placeholderImages ? 'placeholders' : named(render),
    upscale: named(upscale),
    edits: named(backendOf(editJob(saved.editModel), saved, features)),
    voices: named(voices),
  }
  const now = withBackends(features, saved)
  for (const feature of FEATURES) {
    const { available, reason } = now[feature]
    const where = on[feature] ? ` (${on[feature]})` : ''
    console.log(
      `${FEATURE_NAMES[feature]}: ${available ? `available${where}` : `not available (${reason})`}`,
    )
  }
  for (const comfy of saved.backends.filter((b) => b.kind === 'comfyui')) {
    const uses = {
      imageModel: render?.id === comfy.id ? saved.imageModel : undefined,
      upscaler: upscale?.id === comfy.id ? saved.upscaler : undefined,
      voices: voices?.id === comfy.id || undefined,
    }
    if (!uses.imageModel && !uses.upscaler && !uses.voices) continue
    const address = backendAddress(comfy)
    const status = await comfyuiStatus(comfy.address, uses)
    console.log(
      !status.up
        ? `ComfyUI: not answering at ${address}; start it before rendering or speaking`
        : status.ready
        ? `ComfyUI at ${address}: up, ${status.version} on ${status.device}, with what it's sent`
        : `ComfyUI at ${address}: up (${status.version}), but ${status.missing}`,
    )
  }
}
