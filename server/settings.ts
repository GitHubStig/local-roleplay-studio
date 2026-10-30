import { fromFileUrl, isAbsolute } from '@std/path'
import {
  anyImageModel,
  findImageModel,
  IMAGE_BACKENDS,
  type ImageBackendKind,
  imageModelsOf,
} from './images/imageModels.ts'
import { EDIT_MODELS, type EditModel } from './images/editModels.ts'
import { type Upscaler, UPSCALERS } from './images/upscalers.ts'
import {
  COMFYUI_VIDEO_MODELS,
  DEFAULT_VIDEO_MODEL,
  findComfyVideoModel,
} from './video/comfyui/models.ts'
import { type Float16, FLOAT16_CHOICES } from './images/mflux/chip.ts'
import { type Feature, FEATURES } from './features.ts'
import {
  type Backend,
  BACKEND_KINDS,
  BACKEND_WORK,
  type BackendKind,
  HERE,
  type Work,
  WORKS,
} from './backends.ts'

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
  /**
   * The Backends there are (ADR 0022), `here` among them, in the order a job tries them after its
   * preferred one. An API key is kept apart: `SettingsStore`. Read for each job.
   */
  backends: Backend[]
  /** The Backend each kind of work prefers, by id (`pickBackend`). Read for each job. */
  runOn: Record<Work, string>
  /** The model's name on its backend; empty until the player picks one. */
  textModel: string
  /** Let the Text Model reason before answering: slower, often more accurate. */
  thinking: boolean
  /**
   * An Image Model, by name (`images/imageModels.ts`): the same name on mflux and ComfyUI is the
   * same model, rendered wherever Settings send it (ADR 0022).
   */
  imageModel: string
  steps: number
  size: string
  quantize: Quantize
  /** For Image Models that take it: the step cache's ratio, or null for off. */
  stepCache: StepCache
  /**
   * For Image Models that take it: compute in float16, faster on M1 and M2 Macs (the same on M4
   * and M5), the picture slightly different for a seed. Automatic by default: on for M1 to M3.
   * A file from before this had true or false: true was the default, so it reads as Automatic.
   */
  float16: Float16
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
  /** Which model edits pictures (ADR 0021); read when editing, so it applies mid-Session too. */
  editModel: EditModel
  /** The video model clips are made with (`video/comfyui/models.ts`), on a ComfyUI. */
  videoModel: string
  /**
   * The ComfyUI clips go to, by Backend id; none for the one pictures go to, or else the first.
   * Not a kind of work in `runOn`: only a ComfyUI makes clips, and a machine may have none.
   */
  videoOn?: string
  /**
   * The model that pictures Roleplay Frames (the Art Agent); '' for the Session's Text Model.
   * Read when a picture is made, so it applies to running Sessions too.
   */
  artModel: string
  /**
   * Which extras are switched on (all, by default): one that this machine can't run is off
   * whatever this says (`features.ts`). Read on every request, so it applies mid-Session too.
   */
  features: Record<Feature, boolean>
  /**
   * The Limits (ADR 0002); on by default. Off, none are enforced.
   * Read on every request, so it applies mid-Session too.
   */
  limits: boolean
  /**
   * Log every call to the Text Model and the Image Model in its Session's folder (`calls.ts`);
   * off by default. Read when each piece of work starts.
   */
  callLog: boolean
  /**
   * Where the Sessions are kept: an absolute path, or '' for the `sessions/` folder in the app's
   * own. Read when the server starts; changed from the Sessions tab (`sessionsFolder.ts`), which
   * moves to the new folder at once, so `PUT /api/settings` leaves it as saved. Sessions already
   * made stay in the old folder.
   */
  sessionsFolder: string
}

/**
 * What a Session keeps of Settings (ADR 0022): its models, which define what it makes. Its Text
 * Model and Thinking as it started; its Image Model and steps, switched together in it
 * (`switchImageModel`). Everything else, where each runs among it, is read from Settings as they
 * are now, so a change there reaches running Sessions too.
 */
export const SESSION_SETTINGS = [
  'textModel',
  'thinking',
  'imageModel',
  'steps',
] as const satisfies readonly (keyof Settings)[]
export type SessionSettings = Pick<Settings, (typeof SESSION_SETTINGS)[number]> & {
  /**
   * The kind of backend its renders would rather run on, if picked in the Session (mflux or
   * ComfyUI): a preference, not an address, so a Session's folder can be shared as it is, and
   * rendered wherever it's opened. Left out, Settings say.
   */
  imageBackend?: ImageBackendKind
}

/** What a new Session keeps of Settings (`SESSION_SETTINGS`). */
export const sessionSettingsOf = (settings: Settings): SessionSettings => ({
  textModel: settings.textModel,
  thinking: settings.thinking,
  imageModel: settings.imageModel,
  steps: settings.steps,
})

/** How a render runs, as Settings are at each render; logged with each (`calls.ts`). */
export const RENDER_SETTINGS = [
  'size',
  'stepCache',
  'quantize',
  'float16',
] as const satisfies readonly (keyof Settings)[]

/** The Settings a Session renders with: Settings `now`, with the Session's Image Model and steps. */
export const renderSettings = (session: SessionSettings, now: Settings): Settings => ({
  ...now,
  imageModel: session.imageModel,
  steps: session.steps,
})

const DEFAULT_IMAGE_MODEL = findImageModel('mflux', 'qwen-image-2.1')!

/** Ollama at its usual address on this machine, as a fresh install starts with. */
const OLLAMA: Backend = { id: 'ollama', kind: 'ollama', address: '' }

export const DEFAULT_SETTINGS: Settings = {
  backends: [HERE, OLLAMA],
  runOn: { text: 'ollama', images: 'here', upscale: 'here', edits: 'here', voices: 'here' },
  textModel: '',
  thinking: false,
  // The model both backends run (mflux and ComfyUI), and the one measured most (docs/models.md).
  imageModel: DEFAULT_IMAGE_MODEL.id,
  steps: DEFAULT_IMAGE_MODEL.defaultSteps,
  size: SIZE_PRESETS[0].id,
  quantize: null,
  stepCache: 0.4,
  float16: 'auto',
  previews: true,
  seedMode: 'random',
  seed: 42,
  upscaler: UPSCALERS[0].id,
  editModel: EDIT_MODELS[0].id,
  videoModel: DEFAULT_VIDEO_MODEL,
  artModel: '',
  features: Object.fromEntries(FEATURES.map((f) => [f, true])) as Record<Feature, boolean>,
  limits: true,
  callLog: false,
  sessionsFolder: '',
}

/**
 * The defaults on this machine: where mflux or the voice service can't run (a PC), a ComfyUI here
 * for pictures, Upscale, edits and voices, so a fresh install there starts on what it has.
 */
export function machineDefaults(here: { mflux: boolean; voiceService: boolean }): Settings {
  if (here.mflux && here.voiceService) return DEFAULT_SETTINGS
  const comfyui: Backend = { id: 'comfyui', kind: 'comfyui', address: '' }
  const images = here.mflux ? 'here' : comfyui.id
  return {
    ...DEFAULT_SETTINGS,
    backends: [...DEFAULT_SETTINGS.backends, comfyui],
    runOn: {
      text: OLLAMA.id,
      images,
      upscale: images,
      edits: images,
      voices: here.voiceService ? 'here' : comfyui.id,
    },
  }
}

export const MAX_SEED = 2 ** 32 - 1

export type ValidationResult =
  | { ok: true; settings: Settings }
  | { ok: false; issues: string[] }

/** What's wrong with a list of Backends, if anything. */
function backendIssues(backends: unknown): string[] {
  if (!Array.isArray(backends)) return ['backends must be a list']
  const issues: string[] = []
  const ids = new Set<string>()
  for (const b of backends as Partial<Backend>[]) {
    if (typeof b?.id !== 'string' || !b.id || ids.has(b.id)) {
      issues.push('Each Backend needs an id of its own')
      continue
    }
    ids.add(b.id)
    if (!BACKEND_KINDS.includes(b.kind as BackendKind)) {
      issues.push(`Backend ${b.id}'s kind must be one of: ${BACKEND_KINDS.join(', ')}`)
    } else if ((b.kind === 'here') !== (b.id === HERE.id)) {
      issues.push(`Only this machine's own Backend is "${HERE.id}"`)
    }
    if (typeof b.address !== 'string') issues.push(`Backend ${b.id}'s address must be a string`)
    else if (b.address && !URL.canParse(b.address)) {
      issues.push(`Backend ${b.id}'s address must be like http://127.0.0.1:8188`)
    } else if (b.kind === 'openai' && !b.address) {
      issues.push('An OpenAI-compatible server needs its address')
    }
  }
  return issues
}

/** Checks a Settings object, filling in what an older file lacks: `here` in the Backends. */
export function validateSettings(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, issues: ['settings must be an object'] }
  }
  const s = input as Record<string, unknown>
  const issues: string[] = []

  issues.push(...backendIssues(s.backends))
  const backends = Array.isArray(s.backends) ? s.backends as Backend[] : []
  const listed = backends.some((b) => b?.id === HERE.id) ? backends : [HERE, ...backends]
  const runOn = s.runOn as Record<string, unknown> | undefined
  if (typeof runOn !== 'object' || runOn === null) issues.push('runOn must name a Backend per work')
  else {
    for (const work of WORKS) {
      const backend = listed.find((b) => b?.id === runOn[work])
      if (!backend || !BACKEND_WORK[backend.kind]?.includes(work)) {
        issues.push(`runOn.${work} must be a Backend that can do it`)
      }
    }
  }
  if (typeof s.textModel !== 'string') issues.push('textModel must be a string')
  if (s.thinking !== undefined && typeof s.thinking !== 'boolean') {
    issues.push('thinking must be true or false')
  }
  if (typeof s.imageModel !== 'string' || !anyImageModel(s.imageModel)) {
    const ids = new Set(IMAGE_BACKENDS.flatMap((b) => imageModelsOf(b).map((m) => m.id)))
    issues.push(`imageModel must be one of: ${[...ids].join(', ')}`)
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
  if (
    s.float16 !== undefined && typeof s.float16 !== 'boolean' &&
    !FLOAT16_CHOICES.includes(s.float16 as Float16)
  ) {
    issues.push(`float16 must be one of: ${FLOAT16_CHOICES.join(', ')}`)
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
  if (s.sessionsFolder !== undefined) {
    if (typeof s.sessionsFolder !== 'string') issues.push('sessionsFolder must be a string')
    else if (s.sessionsFolder.trim() && !isAbsolute(s.sessionsFolder.trim())) {
      issues.push('sessionsFolder must be a full path, like /Users/you/Sessions, or empty')
    }
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
  if (s.editModel !== undefined && !EDIT_MODELS.some((m) => m.id === s.editModel)) {
    issues.push(`editModel must be one of: ${EDIT_MODELS.map((m) => m.id).join(', ')}`)
  }

  if (
    s.videoOn !== undefined &&
    !listed.some((b) => b?.id === s.videoOn && b?.kind === 'comfyui')
  ) {
    issues.push('videoOn must be a ComfyUI on the Machines tab')
  }
  if (s.videoModel !== undefined && !findComfyVideoModel(s.videoModel as string)) {
    issues.push(`videoModel must be one of: ${COMFYUI_VIDEO_MODELS.map((m) => m.id).join(', ')}`)
  }

  if (issues.length > 0) return { ok: false, issues }
  return {
    ok: true,
    settings: {
      backends: listed.map(({ id, kind, address }) => ({ id, kind, address: address.trim() })),
      runOn: Object.fromEntries(WORKS.map((w) => [w, runOn![w]])) as Record<Work, string>,
      textModel: s.textModel as string,
      thinking: (s.thinking as boolean | undefined) ?? false,
      imageModel: s.imageModel as string,
      steps: s.steps as number,
      size: s.size as string,
      quantize: s.quantize as Quantize,
      stepCache: s.stepCache === undefined ? DEFAULT_SETTINGS.stepCache : s.stepCache as StepCache,
      float16: s.float16 === undefined || s.float16 === true
        ? DEFAULT_SETTINGS.float16
        : s.float16 === false
        ? 'off'
        : s.float16 as Float16,
      previews: (s.previews as boolean | undefined) ?? DEFAULT_SETTINGS.previews,
      seedMode: s.seedMode as SeedMode,
      seed: s.seed as number,
      upscaler: (s.upscaler as Upscaler | undefined) ?? DEFAULT_SETTINGS.upscaler,
      editModel: (s.editModel as EditModel | undefined) ?? DEFAULT_SETTINGS.editModel,
      videoModel: (s.videoModel as string | undefined) ?? DEFAULT_SETTINGS.videoModel,
      ...(s.videoOn !== undefined && { videoOn: s.videoOn as string }),
      artModel: (s.artModel as string | undefined) ?? '',
      // One not mentioned (an older file, or a Feature added since) is on.
      features: { ...DEFAULT_SETTINGS.features, ...(features as Record<Feature, boolean>) },
      limits: (s.limits as boolean | undefined) ?? true,
      callLog: (s.callLog as boolean | undefined) ?? false,
      sessionsFolder: ((s.sessionsFolder as string | undefined) ?? '').trim(),
    },
  }
}

export interface SettingsStore {
  load(): Promise<Settings>
  save(settings: Settings): Promise<void>
  /**
   * A Backend's API key, by its id; '' for none. Kept out of `Settings`, which is copied into each
   * Session and sent to the browser.
   */
  loadApiKey(backend: string): Promise<string>
  saveApiKey(backend: string, key: string): Promise<void>
}

/** Fields of a settings file from before the Backends list (ADR 0022), converted by hand. */
const BEFORE_BACKENDS = ['textBackend', 'textBaseUrl', 'imageBaseUrl', 'textApiKey']

/** The API keys a settings file holds, by Backend id. */
function apiKeysOf(raw: Record<string, unknown>): Record<string, string> {
  const keys = raw.apiKeys
  if (typeof keys !== 'object' || keys === null) return {}
  return Object.fromEntries(Object.entries(keys).filter(([, k]) => typeof k === 'string'))
}

/**
 * Stores Settings as JSON at `path`, falling back to `defaults` (this machine's: `machineDefaults`)
 * when missing or invalid, and filling in from them what an older file lacks. The API keys are in
 * the same file (gitignored), as `apiKeys` by Backend id.
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
  let changing: Promise<unknown> = Promise.resolve()
  /**
   * Changes the file one change at a time: Settings and the API key share it, so two at once could
   * each drop the other's, or clash on the temporary file.
   */
  function inTurn(change: () => Promise<void>): Promise<void> {
    const result = changing.then(change, change)
    changing = result.catch(() => {})
    return result
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
      const old = BEFORE_BACKENDS.filter((key) => key in (parsed as object))
      if (old.length) {
        console.warn(
          `${path} is from before the Backends list (ADR 0022): ${old.join(', ')} are ignored. ` +
            'Add them in Settings, as Backends.',
        )
      }
      const result = validateSettings({ ...defaults, ...(parsed as object) })
      if (!result.ok) {
        console.warn(`Ignoring invalid settings file ${path}: ${result.issues.join('; ')}`)
        return { ...defaults }
      }
      return result.settings
    },
    save: (settings) =>
      inTurn(async () => {
        const keys = apiKeysOf(await readRaw())
        // Only the keys of Backends still listed.
        const kept = Object.fromEntries(
          Object.entries(keys).filter(([id]) => settings.backends.some((b) => b.id === id)),
        )
        await write(Object.keys(kept).length ? { ...settings, apiKeys: kept } : settings)
      }),
    async loadApiKey(backend) {
      return apiKeysOf(await readRaw())[backend] ?? ''
    },
    saveApiKey: (backend, key) =>
      inTurn(async () => {
        const raw = await readRaw()
        const { apiKeys: _, ...rest } = raw
        const { [backend]: _old, ...others } = apiKeysOf(raw)
        const apiKeys = key ? { ...others, [backend]: key } : others
        await write(Object.keys(apiKeys).length ? { ...rest, apiKeys } : rest)
      }),
  }
}
