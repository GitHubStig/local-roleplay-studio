/**
 * Settings' small types. Shared by the server and the web app: types and plain values only.
 */
import type { Backend, Work } from './backends.ts'
import type { ClipSize } from './clips.ts'
import type { Feature } from './features.ts'
import type { EditModel, ImageBackendKind, Upscaler } from './images.ts'

export type SeedMode = 'random' | 'fixed'

export interface SizePreset {
  id: string
  label: string
  width: number
  height: number
}

export const QUANTIZE_OPTIONS = [null, 4, 8] as const

export type Quantize = (typeof QUANTIZE_OPTIONS)[number]

/** How float16 is chosen: always, never, or by this Mac's chip (`float16On`). */
export const FLOAT16_CHOICES = ['auto', 'on', 'off'] as const

export type Float16 = (typeof FLOAT16_CHOICES)[number]

/**
 * How readily a Roleplay's music changes, and how far forward it comes (docs/design.md):
 * steady (few changes, kept low), following the story, or cinematic (changes readily, comes
 * forward). Named steps rather than a number, as a model can't tell 35% from 40%.
 */
export const MUSIC_BEHAVIOURS = ['steady', 'story', 'cinematic'] as const

export type MusicBehaviour = (typeof MUSIC_BEHAVIOURS)[number]

/** The fraction of steps the step cache skips; null for off. */
export const STEP_CACHE_OPTIONS = [null, 0.25, 0.4, 0.5] as const

export type StepCache = (typeof STEP_CACHE_OPTIONS)[number]

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
  /**
   * How an edit on mflux quantizes its weights as they load; read when editing. 8-bit by default:
   * the full weights were no faster and took near twice the memory (docs/research/mflux-upgrade-log.md).
   */
  editQuantize: Quantize
  /** The video model clips are made with (`video/comfyui/models.ts`), on a ComfyUI. */
  videoModel: string
  /** Each video model's clip size, by its id; one not listed makes clips at its own (`size`). */
  videoSizes?: Record<string, ClipSize>
  /**
   * The ComfyUI clips go to, by Backend id; none for the one pictures go to, or else the first.
   * Not a kind of work in `runOn`: only a ComfyUI makes clips, and a machine may have none.
   */
  videoOn?: string
  /** The ComfyUI music goes to, by Backend id; none for the one pictures go to, or else the first. */
  musicOn?: string
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
   * Music in a Roleplay (docs/design.md): off by default, and
   * everything for it stays hidden until it's switched on.
   */
  music: boolean
  /** How readily the music changes (`MUSIC_BEHAVIOURS`); a Session keeps its own. */
  musicBehaviour: MusicBehaviour
  /** The player's taste in music, in their words, for the Score; a Session keeps its own. */
  musicTaste: string
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
 * Model, switched in it (`PUT /sessions/:id/text-model`, ADR 0037), and Thinking as it started;
 * its Image Model and steps, switched together in it (`switchImageModel`); its music's behaviour
 * and taste. Everything else, where each runs among it, is read from Settings as they
 * are now, so a change there reaches running Sessions too.
 */
export const SESSION_SETTINGS = [
  'textModel',
  'thinking',
  'imageModel',
  'steps',
  'musicBehaviour',
  'musicTaste',
] as const satisfies readonly (keyof Settings)[]

export type SessionSettings =
  & Pick<Settings, (typeof SESSION_SETTINGS)[number]>
  & {
    /**
     * The kind of backend its renders would rather run on, if picked in the Session (mflux or
     * ComfyUI): a preference, not an address, so a Session's folder can be shared as it is, and
     * rendered wherever it's opened. Left out, Settings say.
     */
    imageBackend?: ImageBackendKind
  }
