import { fromFileUrl } from '@std/path'
import { findImageModel, IMAGE_MODELS, type Upscaler, UPSCALERS } from './imageModels.ts'

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

export type SeedMode = 'random' | 'fixed'

/** Player-chosen configuration; read when a Session starts. */
export interface Settings {
  /** Ollama model name; empty until the player picks one. */
  textModel: string
  /** Let the Text Model reason before answering: slower, often more accurate. */
  thinking: boolean
  imageModel: string
  steps: number
  size: string
  quantize: Quantize
  seedMode: SeedMode
  /** Used only when `seedMode` is `fixed`. */
  seed: number
  /** Which SeedVR2 model Upscale uses; read when upscaling, so it applies mid-Session too. */
  upscaler: Upscaler
}

export const DEFAULT_SETTINGS: Settings = {
  textModel: '',
  thinking: false,
  imageModel: IMAGE_MODELS[0].id,
  steps: IMAGE_MODELS[0].defaultSteps,
  size: SIZE_PRESETS[0].id,
  quantize: null,
  seedMode: 'random',
  seed: 42,
  upscaler: UPSCALERS[0].id,
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

  if (typeof s.textModel !== 'string') issues.push('textModel must be a string')
  if (s.thinking !== undefined && typeof s.thinking !== 'boolean') {
    issues.push('thinking must be true or false')
  }
  if (typeof s.imageModel !== 'string' || !findImageModel(s.imageModel)) {
    issues.push(`imageModel must be one of: ${IMAGE_MODELS.map((m) => m.id).join(', ')}`)
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
  if (s.seedMode !== 'random' && s.seedMode !== 'fixed') {
    issues.push('seedMode must be "random" or "fixed"')
  }
  if (!Number.isInteger(s.seed) || (s.seed as number) < 0 || (s.seed as number) > MAX_SEED) {
    issues.push(`seed must be an integer from 0 to ${MAX_SEED}`)
  }

  if (s.upscaler !== undefined && !UPSCALERS.some((u) => u.id === s.upscaler)) {
    issues.push(`upscaler must be one of: ${UPSCALERS.map((u) => u.id).join(', ')}`)
  }

  if (issues.length > 0) return { ok: false, issues }
  return {
    ok: true,
    settings: {
      textModel: s.textModel as string,
      thinking: (s.thinking as boolean | undefined) ?? false,
      imageModel: s.imageModel as string,
      steps: s.steps as number,
      size: s.size as string,
      quantize: s.quantize as Quantize,
      seedMode: s.seedMode as SeedMode,
      seed: s.seed as number,
      upscaler: (s.upscaler as Upscaler | undefined) ?? DEFAULT_SETTINGS.upscaler,
    },
  }
}

export interface SettingsStore {
  load(): Promise<Settings>
  save(settings: Settings): Promise<void>
}

/** Stores Settings as JSON at `path`, falling back to defaults when missing or invalid. */
export function fileSettingsStore(path: string | URL): SettingsStore {
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
      const tmp = `${path instanceof URL ? fromFileUrl(path) : path}.tmp`
      await Deno.writeTextFile(tmp, JSON.stringify(settings, null, 2) + '\n')
      await Deno.rename(tmp, path)
    },
  }
}
