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
  seedMode: SeedMode
  /** Used only when `seedMode` is `fixed`. */
  seed: number
  /** Which SeedVR2 model Upscale uses; read when upscaling, so it applies mid-Session too. */
  upscaler: Upscaler
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
}

export const DEFAULT_SETTINGS: Settings = {
  textBackend: 'ollama',
  textBaseUrl: '',
  textModel: '',
  thinking: false,
  imageBackend: 'mflux',
  imageBaseUrl: '',
  imageModel: imageModelsOf('mflux')[0].id,
  steps: imageModelsOf('mflux')[0].defaultSteps,
  size: SIZE_PRESETS[0].id,
  quantize: null,
  stepCache: 0.4,
  fast: false,
  seedMode: 'random',
  seed: 42,
  upscaler: UPSCALERS[0].id,
  artModel: '',
  artStyle: 'prose',
  features: Object.fromEntries(FEATURES.map((f) => [f, true])) as Record<Feature, boolean>,
  limits: true,
}

const MAX_SEED = 2 ** 32 - 1

export type ValidationResult =
  | { ok: true; settings: Settings }
  | { ok: false; issues: string[] }

export function validateSettings(input: unknown): ValidationResult {
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
  const imageBackend = (s.imageBackend ?? 'mflux') as ImageBackendKind
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
  if (s.seedMode !== 'random' && s.seedMode !== 'fixed') {
    issues.push('seedMode must be "random" or "fixed"')
  }
  if (!Number.isInteger(s.seed) || (s.seed as number) < 0 || (s.seed as number) > MAX_SEED) {
    issues.push(`seed must be an integer from 0 to ${MAX_SEED}`)
  }

  if (s.limits !== undefined && typeof s.limits !== 'boolean') {
    issues.push('limits must be true or false')
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
      seedMode: s.seedMode as SeedMode,
      seed: s.seed as number,
      upscaler: (s.upscaler as Upscaler | undefined) ?? DEFAULT_SETTINGS.upscaler,
      artModel: (s.artModel as string | undefined) ?? '',
      artStyle: (s.artStyle as ArtStyle | undefined) ?? 'prose',
      // One not mentioned (an older file, or a Feature added since) is on.
      features: { ...DEFAULT_SETTINGS.features, ...(features as Record<Feature, boolean>) },
      limits: (s.limits as boolean | undefined) ?? true,
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
 * Stores Settings as JSON at `path`, falling back to defaults when missing or invalid. The API key
 * is in the same file (gitignored), as `textApiKey`.
 */
export function fileSettingsStore(path: string | URL): SettingsStore {
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
        if (err instanceof Deno.errors.NotFound) return { ...DEFAULT_SETTINGS }
        throw err
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        console.warn(`Ignoring unreadable settings file ${path}; using defaults`)
        return { ...DEFAULT_SETTINGS }
      }
      const result = validateSettings({ ...DEFAULT_SETTINGS, ...(parsed as object) })
      if (!result.ok) {
        console.warn(`Ignoring invalid settings file ${path}: ${result.issues.join('; ')}`)
        return { ...DEFAULT_SETTINGS }
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
