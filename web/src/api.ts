import type { RoleplaySession } from './roleplay/api'
export interface Health {
  ok: boolean
}

export type Quantize = null | 4 | 8
export type SeedMode = 'random' | 'fixed'

/**
 * The extras beyond the Text Model, each with its own backend: pictures, voices, and 3D (SHARP,
 * TripoSplat, LiTo). One is on when this machine can run it and Settings has it switched on.
 */
export const FEATURES = ['images', 'upscale', 'voices', 'scenes', 'figures', 'lito'] as const
export type Feature = (typeof FEATURES)[number]

/** Whether this machine can run a Feature, and if not, why not. */
export interface Availability {
  available: boolean
  reason?: string
}

/** Where the Text Model runs: Ollama, or any server with the OpenAI chat API. */
export type TextBackend = 'ollama' | 'openai'

export interface Settings {
  textBackend: TextBackend
  /** The backend's address; '' for Ollama's default. */
  textBaseUrl: string
  /** From the server: whether an API key is saved (the key itself is never sent back). */
  textApiKeySet?: boolean
  /** Sent only to replace the saved API key; '' removes it. */
  textApiKey?: string
  textModel: string
  thinking: boolean
  imageBackend: ImageBackend
  /** ComfyUI's address; '' for its default. */
  imageBaseUrl: string
  imageModel: string
  steps: number
  size: string
  quantize: Quantize
  /** The fraction of steps the step cache skips, for models that take it; null for off. */
  stepCache: number | null
  /** Render with the model's fast mode (its own steps), for models that have one. */
  fast: boolean
  /** Compute in float16, for models that take it: faster on M1 and M2 Macs. */
  float16: boolean
  /** Show the picture forming while it renders (ComfyUI's previews). Applies at once. */
  previews: boolean
  seedMode: SeedMode
  seed: number
  /** Which SeedVR2 model Upscale uses; applies to the next upscale, even mid-Session. */
  upscaler: string
  /** Where Upscale runs (the ComfyUI at `imageBaseUrl`, or mflux), whichever rendered. */
  upscaleBackend: ImageBackend
  /** Where voices are made: the voice service (a Mac), or the ComfyUI at `imageBaseUrl`. */
  voiceBackend: 'mlx-audio' | 'comfyui'
  /** The Limits; off, only "everyone depicted is an adult" is enforced. Applies at once. */
  limits: boolean
  /** Log every call to the Text and Image Models in its Session's folder, under `calls/`. */
  callLog: boolean
  /** The model that pictures Roleplay Frames; '' for the Session's Text Model. Applies at once. */
  artModel: string
  /** Whether the Art Agent writes prose (better) or tags. Applies at once. */
  artStyle: 'prose' | 'tags'
  /** Which Features are switched on (one this machine can't run is off whatever this says). */
  features: Record<Feature, boolean>
}

/** Where pictures are made: mflux (Apple Silicon Macs) or a ComfyUI server (any machine). */
export type ImageBackend = 'mflux' | 'comfyui'

export interface ImageModelOption {
  id: string
  label: string
  defaultSteps: number
  /** Takes the step cache (mflux). */
  stepCache: boolean
  /** The steps its fast mode runs at; absent when it has none (mflux). */
  fastSteps?: number
  /** Can be quantized to 8 or 4 bits as it loads (mflux). */
  quantize: boolean
  /** Takes float16 compute (mflux). */
  float16: boolean
}

export interface SizePreset {
  id: string
  label: string
  width: number
  height: number
}

/** A Text backend's models, or why it couldn't list them. */
export interface TextModelOptions {
  textModels: string[]
  /** The Text Models that can reason before answering. */
  thinkingModels: string[]
  textModelsError?: string
}

export interface SettingsOptions extends TextModelOptions {
  /** Each backend's Image Models. */
  imageModels: Record<ImageBackend, ImageModelOption[]>
  sizePresets: SizePreset[]
  upscalers: { id: string; label: string }[]
  /** Which Features this machine can run, worked out when the server started. */
  features: Record<Feature, Availability>
}

export class ApiError extends Error {
  readonly status: number
  readonly issues: string[]

  constructor(message: string, status: number, issues: string[] = []) {
    super(message)
    this.status = status
    this.issues = issues
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error ?? `Request failed: ${res.status}`, res.status, body.issues)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export const getHealth = () => request<Health>('/api/health')

export const getSettings = () => request<Settings>('/api/settings')

export const getSettingsOptions = () => request<SettingsOptions>('/api/settings/options')

/** Whether ComfyUI answers at an address, and has the files of what will run there. */
export type ComfyStatus =
  | { up: true; version: string; device: string; ready: boolean; missing?: string }
  | { up: false; error: string }

/**
 * Checks ComfyUI at an address not saved yet ('' for its default), for the Image Model and the
 * upscaler that would run there.
 */
export const checkComfyUI = (
  imageBaseUrl: string,
  uses: { imageModel?: string; upscaler?: string; voices?: boolean },
) =>
  request<ComfyStatus>('/api/settings/comfyui', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBaseUrl, ...uses }),
  })

/** The models on a Text backend that isn't saved yet; without a key, with the saved one. */
export const listTextModels = (
  connection: Pick<Settings, 'textBackend' | 'textBaseUrl' | 'textApiKey'>,
) =>
  request<TextModelOptions>('/api/settings/text-models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(connection),
  })

export const saveSettings = (settings: Settings) =>
  request<Settings>('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })

export interface ScenarioSummary {
  id: string
  title: string
  description: string
}

export interface ScenarioLoadError {
  file: string
  message: string
}

export interface ScenarioList {
  scenarios: ScenarioSummary[]
  errors: ScenarioLoadError[]
}

export const getScenarios = () => request<ScenarioList>('/api/scenarios')

/**
 * A Session's whole state at one Frame: one paragraph describing the image, written in this order:
 * subject and identity → pose and limbs → expression → camera angle and framing → clothing →
 * environment → lighting → color → art style and medium.
 */
export type ImagePrompt = string

/** How an Action was received; only `done` changes an Image Prompt. */
export type Outcome = 'done' | 'declined' | 'unclear'

/** Seconds writing the Frame took; each picture keeps its own render's. */
export interface FrameTimings {
  text: number
}

/**
 * A Frame's picture as a 2.5D scene of Gaussian splats, made with SHARP: it turns a little from the
 * picture's view, not all the way round.
 */
export interface Scene {
  /** `.ply` file, served like the pictures. */
  file: string
  /** The picture it was made from: the upscale if there was one, else the original. */
  from?: string
  splats: number
  /** The depth to orbit around. */
  pivot: number
  /** The camera it was made for: vertical field of view in degrees, and width / height. */
  fov: number
  aspect: number
  timings: { queued?: number; scene: number }
}

/** The person in a Frame's picture lifted out as a full 3D figure (TripoSplat or LiTo). */
export interface Figure {
  /** `.ply` file, served like the pictures. */
  file: string
  splats: number
  /** The picture it was made from: the upscale if there was one. */
  from: string
  timings: { queued?: number; figure: number }
}

/** What a Frame's picture can be made into in 3D, by the field it's kept in. */
export type Made3d = 'scene' | 'figure' | 'lito'

/** The Feature each kind of 3D needs. */
export const MADE3D_FEATURE: Record<Made3d, Feature> = {
  scene: 'scenes',
  figure: 'figures',
  lito: 'lito',
}

/**
 * A Frame's picture by one Image Model, and what's made from it, in every kind of Session: what the
 * picture buttons, the 3D buttons and the viewers read.
 */
export interface Picture {
  image: string
  /** The Image Model that rendered it. */
  imageModel: string
  /** The image upscaled to 2048 px, once upscaled. */
  upscaled?: string
  /** The Image Prompt changed since it was rendered. */
  stale?: boolean
  /** The picture made into a 2.5D scene (SHARP), once asked for. */
  scene?: Scene
  /** The person in the picture as a 3D figure (TripoSplat), once asked for. */
  figure?: Figure
  /** The same, made with Apple's LiTo. */
  lito?: Figure
  /** Seconds the render waited for another (only if it had to) and took. */
  timings?: { queued?: number; image: number }
}

/** A Frame of any kind, as far as its pictures go. */
export interface PicturedFrame {
  index: number
  /** One per Image Model it was rendered with, oldest first; none until rendered. */
  pictures: Picture[]
}

/**
 * The picture a Frame shows: its picture by `model` (the Session's), or else its latest, which is
 * then changed since render (as `shownPicture` on the server).
 */
export const shownPicture = (frame: PicturedFrame, model: string): Picture | undefined =>
  frame.pictures.find((p) => p.imageModel === model) ?? frame.pictures.at(-1)

/** A picture's Image Prompt changed since it was rendered, or it's by another Image Model. */
export const changedSinceRender = (picture: Picture, model: string): boolean =>
  !!picture.stale || picture.imageModel !== model

/** A Chain Frame: made from the previous one by an Action. */
export interface ChainFrame extends PicturedFrame {
  action: string | null
  prompt: ImagePrompt
  narration: string
  outcome: Outcome
  /** The Text Model's reasoning, when thinking was on. */
  thinking?: string
  timings?: FrameTimings
  createdAt: string
}

/** A Storyboard Frame: planned from a Beat, then edited and rendered on its own. */
export interface StoryboardFrame extends PicturedFrame {
  /** What happens in this Frame. */
  beat: string
  /** Its own seven sentences; the prompt adds who it shows before and the Look's style after. */
  body: string
  /** Names of the Look's people it shows, most prominent first; none for the place alone. */
  shown: string[]
  /** Exactly what the Image Model renders. */
  prompt: ImagePrompt
  /** It crosses a Limit and can't be rendered until edited. */
  blocked?: string
  timings?: FrameTimings
  createdAt: string
}

/** One person in a Storyboard's Look: Frames that show them use their identity. */
export interface Person {
  name: string
  identity: string
}

/** The most people one Storyboard Frame's prompt describes (`MAX_SHOWN` on the server). */
export const MAX_SHOWN = 3

/** The identities and art style Storyboard Frames share: each takes who it shows. */
export interface Look {
  people: Person[]
  style: string
}

/** A Chain makes each Frame from the previous one; a Storyboard plans all its Frames together. */
export type SessionKind = 'chain' | 'storyboard' | 'roleplay'

/** What each kind of Session is called on screen. */
export const KIND_LABELS: Record<SessionKind, string> = {
  chain: 'Chain',
  storyboard: 'Storyboard',
  roleplay: 'Roleplay',
}

/** `download`: a model is downloading, the first time it's used, before it renders or speaks. */
export type Activity = 'text' | 'queued' | 'image' | 'download'

/** What the screens say while a model downloads. */
export const DOWNLOADING = 'Downloading the model (first use only)…'

export interface SessionBase {
  id: string
  /** The typed Brief it started from; null when started from a Scenario. */
  brief: string | null
  /** The Scenario it started from; null when started from a typed Brief. */
  scenarioId: string | null
  settings: Settings
  seed: number
  createdAt: string
  /** Its Scenario's title, or the start of its typed Brief (only from `getSession`). */
  title?: string
  /** What work in progress is doing, or null when idle (only from `getSession`). */
  activity?: Activity | null
  /** Which Frame that work is on, for Storyboards (only from `getSession`). */
  activeFrame?: number | null
  /** The size its pictures render at, from its Settings (only from `getSession`). */
  imageSize?: { width: number; height: number }
}

export interface ChainSession extends SessionBase {
  kind: 'chain'
  frames: ChainFrame[]
  /** Render each Frame as it's made (on, or left out); off, only its prompt, to render later. */
  renderFrames?: boolean
}

export interface StoryboardSession extends SessionBase {
  kind: 'storyboard'
  frameCount: number
  /** Null until planned. */
  look: Look | null
  frames: StoryboardFrame[]
}

export type Session = ChainSession | StoryboardSession | RoleplaySession

/** Progress any streamed work reports: its phase, the model's reasoning, render steps. */
export type ProgressEvent =
  /** `queued`: waiting for another Session's render to finish. */
  | { type: 'phase'; phase: Activity }
  | { type: 'thinking'; text: string; restart?: boolean }
  | { type: 'progress'; step: number; total: number }

/** How streamed work ends when it doesn't succeed. */
export type EndEvent =
  | { type: 'failed'; message: string; sessionDiscarded: boolean }
  | { type: 'cancelled'; sessionDiscarded: boolean }

/** A Chain Frame's stream. */
export type FrameEvent =
  | ProgressEvent
  | EndEvent
  | { type: 'text'; outcome: Outcome; narration: string; prompt: ImagePrompt }
  | { type: 'committed'; frame: ChainFrame }
  /** The Action crossed a Limit, or the Text Model declined it: no Frame was saved. */
  | { type: 'declined'; message: string }
  /** The Text Model couldn't tell what to change, and asks: no Frame was saved. */
  | { type: 'unclear'; message: string }
  /** The Text Model took the Action but left the Image Prompt as it was: no Frame was saved. */
  | { type: 'unchanged'; message: string }

/** An upscale's stream: ends with the Session, the Frame now upscaled. */

/** A Storyboard's streams: planning, rendering a Frame, editing a Frame by Action. */
export type StoryboardEvent =
  | ProgressEvent
  | EndEvent
  | { type: 'look'; look: Look }
  | { type: 'beats'; beats: string[] }
  | { type: 'planned-frame'; frame: StoryboardFrame }
  | { type: 'planned'; session: StoryboardSession }
  | { type: 'rendered'; frame: StoryboardFrame }
  | { type: 'edited'; outcome: Outcome; narration: string; session: StoryboardSession }

export const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

/** What a new Session starts from: a saved Scenario or a typed Brief. */
export type SessionStart =
  & { kind: SessionKind; frameCount?: number }
  & ({ scenarioId: string; brief?: never } | { brief: string; scenarioId?: never })

export const createSession = (start: SessionStart) => post<Session>('/api/sessions', start)

export const getSession = (id: string) => request<Session>(`/api/sessions/${id}`)

/** Whether a Chain renders each Frame as it's made. */
/**
 * Switches a Session's Image Model, one of its Image backend's; it comes back with its steps reset
 * to that model's default.
 */
export const setImageModel = <S>(id: string, imageModel: string) =>
  put<S>(`/api/sessions/${id}/image-model`, { imageModel })

export const setRenderFrames = (id: string, renderFrames: boolean) =>
  request<ChainSession>(`/api/sessions/${id}/render-frames`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ renderFrames }),
  })

/** A saved Session as listed on Home. */
export interface SessionSummary {
  id: string
  kind: SessionKind
  scenarioId: string | null
  /** The Scenario's title, or the start of the typed Brief. */
  title: string
  frames: number
  latestImage: string | null
  /**
   * Shown on its card in place of a picture until there is one: a Roleplay's latest line, a
   * Chain's latest Narration, a Storyboard's first Beat.
   */
  excerpt?: string | null
  createdAt: string
  updatedAt: string
  /** What a Frame in progress is doing, or null when idle. */
  activity: Activity | 'audio' | null
}

export const listSessions = () => request<SessionSummary[]>('/api/sessions')

export const deleteSession = (id: string) =>
  request<void>(`/api/sessions/${id}`, { method: 'DELETE' })

/** Undoes a Chain's latest Frame, which must be Frame `index`; returns the updated Session. */
export const undoFrame = (id: string, index: number) =>
  request<ChainSession>(`/api/sessions/${id}/frames/${index}`, { method: 'DELETE' })

export const put = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

/** Replaces a Storyboard Frame's own sentences, typed by hand, and who it shows. */
export const saveFrameBody = (id: string, index: number, body: string, shown: string[]) =>
  put<StoryboardSession>(`/api/sessions/${id}/frames/${index}`, { body, shown })

/** Replaces a Storyboard's Look; every Frame's prompt follows. */
export const saveLook = (id: string, look: Look) =>
  put<StoryboardSession>(`/api/sessions/${id}/look`, look)

export async function cancelFrame(id: string): Promise<void> {
  await fetch(`/api/sessions/${id}/cancel`, { method: 'POST' })
}

export const imageUrl = (sessionId: string, file: string) =>
  `/api/sessions/${sessionId}/images/${file}`

/** The latest preview of a render in progress (ComfyUI's), asked for again at each step. */
export const previewUrl = (sessionId: string, step: number) =>
  `/api/sessions/${sessionId}/preview?step=${step}`

/** Splits a server-sent event stream into parsed events, across arbitrary chunk boundaries. */
export function createSseParser<E>(onEvent: (event: E) => void) {
  let buffer = ''
  return (chunk: string) => {
    buffer += chunk
    let end: number
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const data = block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6))
      if (data.length) onEvent(JSON.parse(data.join('\n')))
    }
  }
}

/**
 * POSTs to a streaming route and reports its events. `finalTypes` are the events that end the
 * work; a stream that closes without one is reported as a failure (a lost connection).
 */
/** Streams a POST's server-sent events to `onEvent` until one of `finalTypes`, or an end. */
export async function streamEvents<E extends { type: string }>(
  path: string,
  body: unknown,
  finalTypes: string[],
  onEvent: (event: E | EndEvent) => void,
): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}))
    throw new ApiError(err.error ?? `Request failed: ${res.status}`, res.status)
  }
  let finished = false
  const parse = createSseParser<E>((event) => {
    if ([...finalTypes, 'failed', 'cancelled'].includes(event.type)) finished = true
    onEvent(event)
  })
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  for (let r = await reader.read(); !r.done; r = await reader.read()) parse(r.value)
  if (!finished) {
    onEvent({ type: 'failed', message: 'Lost connection to the server', sessionDiscarded: false })
  }
}

/** Runs a Chain Frame (the Opening Frame when `action` is null), reporting its progress. */
export const streamFrame = (
  sessionId: string,
  action: string | null,
  onEvent: (event: FrameEvent) => void,
) =>
  streamEvents<FrameEvent>(
    `/api/sessions/${sessionId}/frames`,
    action === null ? {} : { action },
    ['committed', 'declined', 'unclear', 'unchanged'],
    onEvent,
  )

/** Plans a Storyboard, reporting its Look, Beats and Frames as they arrive. */
export const planStoryboard = (sessionId: string, onEvent: (event: StoryboardEvent) => void) =>
  streamEvents<StoryboardEvent>(`/api/sessions/${sessionId}/plan`, {}, ['planned'], onEvent)

/** Edits one Storyboard Frame through the Text Model, following an Action. */
export const editStoryboardFrame = (
  sessionId: string,
  index: number,
  action: string,
  onEvent: (event: StoryboardEvent) => void,
) =>
  streamEvents<StoryboardEvent>(
    `/api/sessions/${sessionId}/frames/${index}/edit`,
    { action },
    ['edited'],
    onEvent,
  )

// --- Background work, queued per Session: every kind's.

/**
 * Background work on a Frame: picturing, rendering, upscaling or speaking it, making its picture
 * into a 2.5D scene (SHARP), or lifting its person out as a 3D figure (TripoSplat, LiTo); `voice`
 * designs a new take of the Character's voice (filed under the opening Frame). A Chain has
 * `upscale`, `scene`, `figure` and `lito`; a Storyboard `render` too; a Roleplay has them all.
 */
export type JobKind =
  | 'picture'
  | 'render'
  | 'upscale'
  | 'voice'
  | 'speak'
  | 'speak-thought'
  | 'scene'
  | 'figure'
  | 'lito'

/** A queued, running or failed job. Finished jobs drop off the list. */
export interface Job {
  id: string
  kind: JobKind
  frameIndex: number
  status: 'queued' | 'running' | 'failed'
  /** Writing (text), waiting for a render (queued), rendering (image), or speaking (audio). */
  phase?: Activity | 'audio'
  progress?: { step: number; total: number }
  error?: string
  createdAt: string
}

/** A Session's jobs (a Roleplay's or a Chain's): running, then queued in order, then failed. */
export const listJobs = (id: string) => request<Job[]>(`/api/sessions/${id}/jobs`)

/** Queues a job on a Frame; returns the whole queue. Asking twice for the same job queues it once. */
export const queueJob = (id: string, kind: JobKind, frameIndex: number) =>
  post<Job[]>(`/api/sessions/${id}/jobs`, { kind, frameIndex })

/** Puts a failed job back in the queue; returns the queue. */
export const retryJob = (id: string, jobId: string) =>
  post<Job[]>(`/api/sessions/${id}/jobs/${jobId}/retry`)

/** Cancels a queued or running job, or dismisses a failed one; returns the queue. */
export const cancelJob = (id: string, jobId: string) =>
  request<Job[]>(`/api/sessions/${id}/jobs/${jobId}`, { method: 'DELETE' })

/** Clears a Session's queue: cancels what's running and queued, and dismisses what failed. */
export const clearJobs = (id: string) =>
  request<Job[]>(`/api/sessions/${id}/jobs`, { method: 'DELETE' })
