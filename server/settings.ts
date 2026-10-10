import { fromFileUrl } from '@std/path'
import {
  findImageModel,
  IMAGE_BACKENDS,
  type ImageBackendKind,
  imageModelsOf,
} from './images/imageModels.ts'
import { type Upscaler, UPSCALERS } from './images/mflux/models.ts'
import { ART_STYLES, type ArtStyle } from './roleplay/art.ts'
import { type Feature, FEATURES } from './features.ts'
import { TEXT_BACKENDS, type TextBackendKind } from './text/backend.ts'
import { VOICE_BACKENDS, type VoiceBackendKind } from './voice/voice.ts'

export interface SizePreset {
  id: string
  label: string
  width: number
  height: number
}

export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: 'portrait', label: 'Portrait 832×1216', width: 832, height: 1216 },
  { id: 'square', label: 'Square 1024×1024', width: 1024, height: 1024 },
  { id: 'landscape', label: 'Landscape 1216×832', width: 1216, height: 832 },
  { id: 'portrait-small', label: 'Small portrait 512×768 (faster)', width: 512, height: 768 },
  { id: 'square-small', label: 'Small square 512×512 (fastest)', width: 512, height: 512 },
  { id: 'landscape-small', label: 'Small landscape 768×512 (faster)', width: 768, height: 512 },
]

export const QUANTIZE_OPTIONS = [null, 4, 8] as const
export type Quantize = (typeof QUANTIZE_OPTIONS)[number]

/** The fraction of steps the step cache skips; null for off. */
export const STEP_CACHE_OPTIONS = [null, 0.25, 0.4, 0.5] as const
export type StepCache = (typeof STEP_CACHE_OPTIONS)[number]

export type SeedMode = 'random' | 'fixed'

/** Player-chosen configuration; read when a Session starts. */
export interface Settings {
  /** Where the Text Model runs (`text/backend.ts`). Its API key is kept apart: `SettingsStore`. */
  textBackend: TextBackendKind
  /** The backend's address; '' for Ollama's default. */
  textBaseUrl: string
  /** The model's name on the backend; empty until the player picks one. */
  textModel: string
  /** Let the Text Model reason before answering: slower, often more accurate. */
  thinking: boolean
  /** Where pictures are made (`images/imageModels.ts`). */
  imageBackend: ImageBackendKind
  /** ComfyUI's address; '' for its default (`COMFYUI_URL`). Unused by mflux. */
  imageBaseUrl: string
  /** One of the backend's Image Models. */
  imageModel: string
  steps: number
  size: string
  quantize: Quantize
  /** For Image Models that take it: the step cache's ratio, or null for off. */
  stepCache: StepCache
  /** For Image Models with a fast mode: render with it (its own steps), not `steps`. */
  fast: boolean
  /**
   * For Image Models that take it: compute in float16, faster on M1 and M2 Macs (the same on M4
   * and M5), the picture slightly different for a seed. On by default.
   */
  float16: boolean
  /**
   * Show the picture forming while it renders, from the previews a backend sends at each step
   * (ComfyUI; mflux sends none). On by default. Read on every request, so it applies at once.
   */
  previews: boolean
  seedMode: SeedMode
  /** Used only when `seedMode` is `fixed`. */
  seed: number
  /** Which SeedVR2 model Upscale uses; read when upscaling, so it applies mid-Session too. */
  upscaler: Upscaler
  /**
   * Where Upscale runs: mflux, or the ComfyUI at `imageBaseUrl` (which may be another machine),
   * whichever backend rendered. Read when upscaling. An older file without it follows
   * `imageBackend`.
   */
  upscaleBackend: ImageBackendKind
  /**
   * Where voices are made: the voice service (mlx-audio, a Mac), or the ComfyUI at `imageBaseUrl`
   * with TTS Audio Suite's nodes. Read when a voice is made, so it applies mid-Session too.
   */
  voiceBackend: VoiceBackendKind
  /**
   * The model that pictures Roleplay Frames (the Art Agent); '' for the Session's Text Model.
   * Read when a picture is made, so it applies to running Sessions too.
   */
  artModel: string
  /** Whether the Art Agent writes prose (the default, and better) or tags. Applies at once. */
  artStyle: ArtStyle
  /**
   * Which extras are switched on (all, by default): one that this machine can't run is off
   * whatever this says (`features.ts`). Read on every request, so it applies mid-Session too.
   */
  features: Record<Feature, boolean>
  /**
   * The Limits (ADR 0002); on by default. Off, only "everyone depicted is an adult" is enforced.
   * Read on every request, so it applies mid-Session too.
   */
  limits: boolean
  /**
   * Log every call to the Text Model and the Image Model in its Session's folder (`calls.ts`);
   * off by default. Read when each piece of work starts.
   */
  callLog: boolean
}

/**
 * How a render runs on this machine, read from Settings at each render so a change reaches running
 * Sessions too. A Session keeps the rest of its image settings, which define its pictures: its
 * Image backend, Image Model and steps (switched together, `switchImageModel`), and its seed.
 */
export const RENDER_SETTINGS = [
  'size',
  'fast',
  'stepCache',
  'quantize',
  'float16',
  'imageBaseUrl',
] as const satisfies readonly (keyof Settings)[]

/** The Settings a Session renders with: its own, with `RENDER_SETTINGS` as Settings are `now`. */
export const renderSettings = (session: Settings, now: Settings): Settings => ({
  ...session,
  ...Object.fromEntries(RENDER_SETTINGS.map((key) => [key, now[key]])),
})

const DEFAULT_IMAGE_MODEL = findImageModel('mflux', 'qwen-image-2.1')!

export const DEFAULT_SETTINGS: Settings = {
  textBackend: 'ollama',
  textBaseUrl: '',
  textModel: '',
  thinking: false,
  imageBackend: 'mflux',
  imageBaseUrl: '',
  // The model both backends run (mflux and ComfyUI), and the one measured most (docs/models.md).
  imageModel: DEFAULT_IMAGE_MODEL.id,
  steps: DEFAULT_IMAGE_MODEL.defaultSteps,
  size: SIZE_PRESETS[0].id,
  quantize: null,
  stepCache: 0.4,
  fast: false,
  float16: true,
  previews: true,
  seedMode: 'random',
  seed: 42,
  upscaler: UPSCALERS[0].id,
  upscaleBackend: 'mflux',
  voiceBackend: 'mlx-audio',
  artModel: '',
  artStyle: 'prose',
  features: Object.fromEntries(FEATURES.map((f) => [f, true])) as Record<Feature, boolean>,
  limits: true,
  callLog: false,
}

/**
 * The defaults on this machine: ComfyUI for pictures, Upscale and voices where mflux or the voice
 * service can't run (a PC), so a fresh install there starts on what it has.
 */
export function machineDefaults(here: { mflux: boolean; voiceService: boolean }): Settings {
  const imageBackend: ImageBackendKind = here.mflux ? 'mflux' : 'comfyui'
  const models = imageModelsOf(imageBackend)
  const model = models.find((m) => m.id === DEFAULT_SETTINGS.imageModel) ?? models[0]
  return {
    ...DEFAULT_SETTINGS,
    imageBackend,
    imageModel: model.id,
    steps: model.defaultSteps,
    upscaleBackend: imageBackend,
    voiceBackend: here.voiceService ? 'mlx-audio' : 'comfyui',
  }
}

const MAX_SEED = 2 ** 32 - 1

export type ValidationResult =
  | { ok: true; settings: Settings }
  | { ok: false; issues: string[] }

/**
 * Checks a Settings object, filling in what an older file lacks: `imageBackend` and `voiceBackend`
 * from `defaults` (this machine's), `upscaleBackend` from `imageBackend`.
 */
export function validateSettings(
  input: unknown,
  defaults: Settings = DEFAULT_SETTINGS,
): ValidationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, issues: ['settings must be an object'] }
  }
  const s = input as Record<string, unknown>
  const issues: string[] = []

  if (s.textBackend !== undefined && !TEXT_BACKENDS.includes(s.textBackend as TextBackendKind)) {
    issues.push(`textBackend must be one of: ${TEXT_BACKENDS.join(', ')}`)
  }
  if (s.textBaseUrl !== undefined && typeof s.textBaseUrl !== 'string') {
    issues.push('textBaseUrl must be a string')
  } else if (s.textBaseUrl && !URL.canParse(s.textBaseUrl as string)) {
    issues.push('textBaseUrl must be an address like http://localhost:1234/v1')
  } else if (s.textBackend === 'openai' && !s.textBaseUrl) {
    issues.push('An OpenAI-compatible server needs its address')
  }
  if (typeof s.textModel !== 'string') issues.push('textModel must be a string')
  if (s.thinking !== undefined && typeof s.thinking !== 'boolean') {
    issues.push('thinking must be true or false')
  }
  const imageBackend = (s.imageBackend ?? defaults.imageBackend) as ImageBackendKind
  if (!IMAGE_BACKENDS.includes(imageBackend)) {
    issues.push(`imageBackend must be one of: ${IMAGE_BACKENDS.join(', ')}`)
  } else if (typeof s.imageModel !== 'string' || !findImageModel(imageBackend, s.imageModel)) {
    const ids = imageModelsOf(imageBackend).map((m) => m.id)
    issues.push(`imageModel must be one of ${imageBackend}'s: ${ids.join(', ')}`)
  }
  if (s.imageBaseUrl !== undefined && typeof s.imageBaseUrl !== 'string') {
    issues.push('imageBaseUrl must be a string')
  } else if (s.imageBaseUrl && !URL.canParse(s.imageBaseUrl as string)) {
    issues.push('imageBaseUrl must be an address like http://127.0.0.1:8188')
  }
  if (!Number.isInteger(s.steps) || (s.steps as number) < 1 || (s.steps as number) > 100) {
    issues.push('steps must be an integer from 1 to 100')
  }
  if (typeof s.size !== 'string' || !SIZE_PRESETS.some((p) => p.id === s.size)) {
    issues.push(`size must be one of: ${SIZE_PRESETS.map((p) => p.id).join(', ')}`)
  }
  if (!QUANTIZE_OPTIONS.includes(s.quantize as Quantize)) {
    issues.push('quantize must be null, 4 or 8')
  }
  if (s.stepCache !== undefined && !STEP_CACHE_OPTIONS.includes(s.stepCache as StepCache)) {
    issues.push(`stepCache must be one of: ${STEP_CACHE_OPTIONS.join(', ')}`)
  }
  if (s.fast !== undefined && typeof s.fast !== 'boolean') {
    issues.push('fast must be true or false')
  }
  if (s.float16 !== undefined && typeof s.float16 !== 'boolean') {
    issues.push('float16 must be true or false')
  }
  if (s.previews !== undefined && typeof s.previews !== 'boolean') {
    issues.push('previews must be true or false')
  }
  if (s.seedMode !== 'random' && s.seedMode !== 'fixed') {
    issues.push('seedMode must be "random" or "fixed"')
  }
  if (!Number.isInteger(s.seed) || (s.seed as number) < 0 || (s.seed as number) > MAX_SEED) {
    issues.push(`seed must be an integer from 0 to ${MAX_SEED}`)
  }

  if (s.limits !== undefined && typeof s.limits !== 'boolean') {
    issues.push('limits must be true or false')
  }
  if (s.callLog !== undefined && typeof s.callLog !== 'boolean') {
    issues.push('callLog must be true or false')
  }
  if (s.artStyle !== undefined && !ART_STYLES.includes(s.artStyle as ArtStyle)) {
    issues.push(`artStyle must be one of: ${ART_STYLES.join(', ')}`)
  }
  if (s.artModel !== undefined && typeof s.artModel !== 'string') {
    issues.push('artModel must be a string')
  }
  const features = s.features as Record<string, unknown> | undefined
  if (
    features !== undefined &&
    (typeof features !== 'object' || features === null ||
      Object.entries(features).some(([k, v]) =>
        !FEATURES.includes(k as Feature) || typeof v !== 'boolean'
      ))
  ) {
    issues.push(`features must map ${FEATURES.join(', ')} to true or false`)
  }
  if (s.upscaler !== undefined && !UPSCALERS.some((u) => u.id === s.upscaler)) {
    issues.push(`upscaler must be one of: ${UPSCALERS.map((u) => u.id).join(', ')}`)
  }
  if (
    s.upscaleBackend !== undefined && !IMAGE_BACKENDS.includes(s.upscaleBackend as ImageBackendKind)
  ) {
    issues.push(`upscaleBackend must be one of: ${IMAGE_BACKENDS.join(', ')}`)
  }
  if (
    s.voiceBackend !== undefined && !VOICE_BACKENDS.includes(s.voiceBackend as VoiceBackendKind)
  ) {
    issues.push(`voiceBackend must be one of: ${VOICE_BACKENDS.join(', ')}`)
  }

  if (issues.length > 0) return { ok: false, issues }
  return {
    ok: true,
    settings: {
      textBackend: (s.textBackend as TextBackendKind | undefined) ?? 'ollama',
      textBaseUrl: ((s.textBaseUrl as string | undefined) ?? '').trim(),
      textModel: s.textModel as string,
      thinking: (s.thinking as boolean | undefined) ?? false,
      imageBackend,
      imageBaseUrl: ((s.imageBaseUrl as string | undefined) ?? '').trim(),
      imageModel: s.imageModel as string,
      steps: s.steps as number,
      size: s.size as string,
      quantize: s.quantize as Quantize,
      stepCache: s.stepCache === undefined ? DEFAULT_SETTINGS.stepCache : s.stepCache as StepCache,
      fast: (s.fast as boolean | undefined) ?? false,
      float16: (s.float16 as boolean | undefined) ?? DEFAULT_SETTINGS.float16,
      previews: (s.previews as boolean | undefined) ?? DEFAULT_SETTINGS.previews,
      seedMode: s.seedMode as SeedMode,
      seed: s.seed as number,
      upscaler: (s.upscaler as Upscaler | undefined) ?? DEFAULT_SETTINGS.upscaler,
      upscaleBackend: (s.upscaleBackend as ImageBackendKind | undefined) ?? imageBackend,
      voiceBackend: (s.voiceBackend as VoiceBackendKind | undefined) ?? defaults.voiceBackend,
      artModel: (s.artModel as string | undefined) ?? '',
      artStyle: (s.artStyle as ArtStyle | undefined) ?? 'prose',
      // One not mentioned (an older file, or a Feature added since) is on.
      features: { ...DEFAULT_SETTINGS.features, ...(features as Record<Feature, boolean>) },
      limits: (s.limits as boolean | undefined) ?? true,
      callLog: (s.callLog as boolean | undefined) ?? false,
    },
  }
}

export interface SettingsStore {
  load(): Promise<Settings>
  save(settings: Settings): Promise<void>
  /**
   * The Text backend's API key; '' for none. Kept out of `Settings`, which is copied into each
   * Session and sent to the browser.
   */
  loadApiKey(): Promise<string>
  saveApiKey(key: string): Promise<void>
}

/**
 * Stores Settings as JSON at `path`, falling back to `defaults` (this machine's: `machineDefaults`)
 * when missing or invalid, and filling in from them what an older file lacks. The API key is in the
 * same file (gitignored), as `textApiKey`.
 */
export function fileSettingsStore(
  path: string | URL,
  defaults: Settings = DEFAULT_SETTINGS,
): SettingsStore {
  const file = path instanceof URL ? fromFileUrl(path) : path
  async function readRaw(): Promise<Record<string, unknown>> {
    try {
      const parsed = JSON.parse(await Deno.readTextFile(file))
      return typeof parsed === 'object' && parsed !== null ? parsed : {}
    } catch {
      return {}
    }
  }
  async function write(raw: object) {
    const tmp = `${file}.tmp`
    await Deno.writeTextFile(tmp, JSON.stringify(raw, null, 2) + '\n', { mode: 0o600 })
    await Deno.rename(tmp, file)
  }
  return {
    async load() {
      let raw: string
      try {
        raw = await Deno.readTextFile(path)
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) return { ...defaults }
        throw err
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        console.warn(`Ignoring unreadable settings file ${path}; using defaults`)
        return { ...defaults }
      }
      // The backends an older file lacks aren't filled in here: Upscale follows the file's Image
      // backend, and voices this machine's default (`validateSettings`).
      const { imageBackend: _i, upscaleBackend: _u, voiceBackend: _v, ...filled } = defaults
      const result = validateSettings({ ...filled, ...(parsed as object) }, defaults)
      if (!result.ok) {
        console.warn(`Ignoring invalid settings file ${path}: ${result.issues.join('; ')}`)
        return { ...defaults }
      }
      return result.settings
    },
    async save(settings) {
      const { textApiKey } = await readRaw()
      await write(textApiKey ? { ...settings, textApiKey } : settings)
    },
    async loadApiKey() {
      const { textApiKey } = await readRaw()
      return typeof textApiKey === 'string' ? textApiKey : ''
    },
    async saveApiKey(key) {
      const { textApiKey: _, ...rest } = await readRaw()
      await write(key ? { ...rest, textApiKey: key } : rest)
    },
  }
}
