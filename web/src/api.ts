import type { RoleplaySession } from './roleplay/api'
export {
  type Backend,
  BACKEND_NAMES,
  BACKEND_WORK,
  type BackendKind,
  type Work,
} from '../../shared/backends.ts'
import type { Backend } from '../../shared/backends.ts'
export {
  type Clip,
  type ClipAsk,
  type ClipKind,
  type ClipOrder,
  type ClipSize,
} from '../../shared/clips.ts'
import type { ClipAsk, ClipKind, ClipOrder, ClipSize } from '../../shared/clips.ts'
export { type ComfyStatus, type ComfyUses } from '../../shared/comfyui.ts'
import type { ComfyStatus, ComfyUses } from '../../shared/comfyui.ts'
export { type ComparisonExport } from '../../shared/comparison.ts'
import type { ComparisonExport } from '../../shared/comparison.ts'
export { type ClipPromptEvent, type EndEvent, type ProgressEvent } from '../../shared/events.ts'
import type {
  ClipPromptEvent,
  EndEvent,
  FrameEvent as StoredFrameEvent,
  StoryboardEvent as StoredStoryboardEvent,
} from '../../shared/events.ts'
export { type Availability, type Feature, FEATURES } from '../../shared/features.ts'
import type { Availability, Feature } from '../../shared/features.ts'
export {
  type EditModel,
  IMAGE_BACKEND_NAMES,
  type ImageModelOption,
  type ImagePrompt,
  type Upscaler,
} from '../../shared/images.ts'
import type {
  EditModel,
  ImageBackendKind,
  ImageModelOption,
  ImagePrompt,
} from '../../shared/images.ts'
export { type JobKind } from '../../shared/jobKinds.ts'
import type { JobKind } from '../../shared/jobKinds.ts'
export { type EditOrder } from '../../shared/jobs.ts'
import type { EditOrder, Job as StoredJob } from '../../shared/jobs.ts'
export { type Picture, type PictureEdit } from '../../shared/pictures.ts'
import type { Picture, PictureEdit } from '../../shared/pictures.ts'
export {
  type Person,
  type Scenario,
  type ScenarioLoadError,
  type ScenarioSummary,
  type Suggestion,
} from '../../shared/scenario.ts'
import type {
  Scenario,
  ScenarioLoadError,
  ScenarioSummary,
  Suggestion,
} from '../../shared/scenario.ts'
export {
  type ChainFrame,
  type FrameTimings,
  type Look,
  type Outcome,
  type SessionKind,
  type StoryboardFrame,
  type Subject,
} from '../../shared/session.ts'
import type {
  ChainSession as StoredChainSession,
  Look,
  Phase,
  SessionBase as StoredSessionBase,
  SessionKind,
  StoryboardFrame,
  StoryboardSession as StoredStoryboardSession,
} from '../../shared/session.ts'
import type { FolderCheck as StoredFolderCheck } from '../../shared/sessionsFolder.ts'
export {
  type Quantize,
  type SeedMode,
  type SessionSettings,
  type SizePreset,
} from '../../shared/settings.ts'
import type { Settings as StoredSettings, SizePreset } from '../../shared/settings.ts'
export { type Figure, type Scene } from '../../shared/threeD.ts'
import type { StyleScores } from './styleScores'
export interface Health {
  ok: boolean
}

/** Where pictures are made: mflux (Apple Silicon Macs) or a ComfyUI server (any machine). */
export type ImageBackend = ImageBackendKind

/** A Text backend's models, or why it couldn't list them. */
export interface TextModelList {
  textModels: string[]
  /** The Text Models that can reason before answering. */
  thinkingModels: string[]
  textModelsError?: string
}

export interface SettingsOptions extends TextModelList {
  /** Each backend's Image Models. */
  imageModels: Record<ImageBackend, ImageModelOption[]>
  /** The kinds of backend whose models a Session can switch to: mflux here, ComfyUI if listed. */
  imageBackends: ImageBackend[]
  /** The kind of backend each Image Model's renders go to now, by name; none for one nowhere. */
  imageModelsOn?: Record<string, ImageBackend>
  sizePresets: SizePreset[]
  upscalers: { id: string; label: string }[]
  /**
   * Each video model, whether it makes sound (Wan 2.2 doesn't), the size it makes unless Settings say
   * otherwise, and its longest clip at each size, in seconds.
   */
  videoModels: {
    id: string
    label: string
    sound: boolean
    size: ClipSize
    longest: Record<ClipSize, number>
  }[]
  /** The models that can edit a picture here, each on its backend. */
  /** Each with how it likes to be told what to paint. */
  editModels: { id: EditModel; label: string; backends: ImageBackend[]; prompting: string }[]
  /** The kind of backend each edit model's edits go to now, by name; none for one nowhere. */
  editModelsOn?: Record<string, ImageBackend>
  /** Which Features can run, here or on a Backend listed (a ComfyUI). */
  features: Record<Feature, Availability>
  /** Which Features this machine runs itself, worked out when the server started. */
  here: Record<Feature, Availability>
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

/** The folder Sessions are kept in, the default, and how many Sessions are in use. */
export interface SessionsFolderInfo {
  inUse: string
  default: string
  count: number
}

export const getSessionsFolder = () => request<SessionsFolderInfo>('/api/sessions-folder')

/** Opens the folder dialog on the machine the server runs on; null if the player cancels. */
export const pickSessionsFolder = () =>
  request<{ path: string | null }>('/api/sessions-folder/pick', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

const withPath = (method: string, path: string): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path }),
})

/** Whether a folder can hold Sessions, and how many it does. Moves nothing. */
export const checkSessionsFolder = (path: string) =>
  request<FolderCheck>('/api/sessions-folder/check', withPath('POST', path))

/** Keeps Sessions in the folder from now on; '' for the default. */
export const moveSessionsFolder = (path: string) =>
  request<SessionsFolderInfo>('/api/sessions-folder', withPath('PUT', path))

export const getSettingsOptions = () => request<SettingsOptions>('/api/settings/options')

/**
 * Checks a ComfyUI at an address not saved yet ('' for its usual one here), for the Image Model,
 * the upscaler and voices that would run there.
 */
export const checkComfyUI = (address: string, uses: ComfyUses) =>
  request<ComfyStatus>('/api/settings/comfyui', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, ...uses }),
  })

/** The models on a text Backend that isn't saved yet; without `apiKey`, with its saved one. */
export const listTextModels = (backend: Backend & { apiKey?: string }) =>
  request<TextModelList>('/api/settings/text-models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backend),
  })

export const saveSettings = (settings: Settings) =>
  request<Settings>('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })

export interface ScenarioList {
  scenarios: ScenarioSummary[]
  errors: ScenarioLoadError[]
}

export const getScenarios = () => request<ScenarioList>('/api/scenarios')

export const getScenario = (id: string) => request<Scenario>(`/api/scenarios/${id}`)

/** Saves a Scenario over its file in the player's `scenarios/`. */
export const saveScenario = (id: string, scenario: Scenario) =>
  request<Scenario>(`/api/scenarios/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario }),
  })

/** A new Scenario of the player's, under a new id: the page's, or an imported file's text. */
export const createScenario = (from: { scenario: Scenario } | { markdown: string; name: string }) =>
  post<Scenario>('/api/scenarios', from)

export const deleteScenario = (id: string) =>
  request<void>(`/api/scenarios/${id}`, { method: 'DELETE' })

/**
 * A suggestion for one part of the Scenario as it stands, building on `notes` (what's typed there);
 * another each time it's asked.
 */
export const suggestPart = (scenario: Scenario, field: string, notes = '') =>
  post<{ text: string }>('/api/scenarios/suggest', { scenario, field, notes })

/**
 * Expand, as the Scenario page opens: names the People and who's who, and suggests for blanks. Sent
 * the Scenario as it stands when there's one, so what's been edited stands.
 */
export const expandScenario = (
  from: { scenario: Scenario } | { scenarioId: string } | { brief: string },
  signal?: AbortSignal,
) =>
  request<{ scenario: Scenario; suggestions: Suggestion[] }>('/api/scenarios/expand', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(from),
    signal,
  })

/** What each kind of clip is called (ADR 0025), in the order they're offered and listed. */
export const CLIP_KIND_NAMES: Record<ClipKind, string> = {
  'lead-in': 'Lead In',
  'idle-loop': 'Idle Loop',
  'play-out': 'Play out',
  'into-next': 'Into Next',
}

/** What each clip size is called, in the order they're offered. */
export const CLIP_SIZE_NAMES: Record<ClipSize, string> = { small: 'Small', large: 'Large' }

/** What a Frame's picture can be made into in 3D, by the field it's kept in. */
export type Made3d = 'scene' | 'figure' | 'lito'

/** The Feature each kind of 3D needs. */
export const MADE3D_FEATURE: Record<Made3d, Feature> = {
  scene: 'scenes',
  figure: 'figures',
  lito: 'lito',
}

/** The edit a picture shows, if its picked version is one. */
export const pickedEdit = (picture: Picture): PictureEdit | undefined =>
  picture.picked ? picture.edits?.[picture.picked - 1] : undefined

/**
 * A picture as it's shown and used: with its picked version's files (an edit's, ADR 0021) in place
 * of its render's, so what's upscaled, made into 3D, viewed or counted as its clips is that
 * version.
 */
export function asPicked(picture: Picture): Picture {
  const edit = pickedEdit(picture)
  if (!edit) return picture
  const { image, upscaled, scene, figure, lito, clips } = edit
  return { ...picture, image, upscaled, scene, figure, lito, clips }
}

/** A Frame of any kind, as far as its pictures go. */
export interface PicturedFrame {
  index: number
  /** Its Image Prompt, once written. */
  prompt?: ImagePrompt
  /** One per Image Model it was rendered with, oldest first; none until rendered. */
  pictures: Picture[]
}

/**
 * The picture a Frame has to show, as stored: its picture by `model` (the Session's), or else its
 * latest, which is then changed since render (as `shownPicture` on the server).
 */
export const framePicture = (frame: PicturedFrame, model: string): Picture | undefined =>
  frame.pictures.find((p) => p.imageModel === model) ?? frame.pictures.at(-1)

/** The picture a Frame shows (`framePicture`), as its picked version (`asPicked`). */
export function shownPicture(frame: PicturedFrame, model: string): Picture | undefined {
  const picture = framePicture(frame, model)
  return picture && asPicked(picture)
}

/** `image` is a version of this picture: its render, or one of its edits. */
export const hasVersion = (picture: Picture, image: string): boolean =>
  picture.image === image || !!picture.edits?.some((e) => e.image === image)

/**
 * The image that shows a Session on Home: `thumbnail`, for as long as it exists, or else the
 * newest Frame's picture (as `homeImage` on the server).
 */
export function homeImage(
  frames: readonly PicturedFrame[],
  model: string,
  thumbnail?: string,
): string | null {
  if (thumbnail && frames.some((f) => f.pictures.some((p) => hasVersion(p, thumbnail)))) {
    return thumbnail
  }
  return frames.map((f) => shownPicture(f, model)?.image).filter(Boolean).at(-1) ?? null
}

/** A picture's edits by edit model `model`, oldest first: a line of its own from the Original. */
export const editLine = (picture: Picture, model: string): PictureEdit[] =>
  (picture.edits ?? []).filter((e) => e.editModel === model)

/** A picture's Image Prompt changed since it was rendered, or it's by another Image Model. */
export const changedSinceRender = (picture: Picture, model: string): boolean =>
  !!picture.stale || picture.imageModel !== model

/** The most Subjects one Storyboard Frame's prompt describes (`MAX_SHOWN` on the server). */
export const MAX_SHOWN = 3
/** The most Frames a Storyboard has (`FRAME_COUNT.max` on the server). */
export const MAX_FRAMES = 32

/** What each kind of Session is called on screen. */
export const KIND_LABELS: Record<SessionKind, string> = {
  chain: 'Chain',
  storyboard: 'Storyboard',
  roleplay: 'Roleplay',
}

/** `download`: a model is downloading, the first time it's used, before it renders or speaks. */
export type Activity = Phase

/** What the screens say while a model downloads. */
export const DOWNLOADING = 'Downloading the model (first use only)…'

/** A Storyboard Frame's sentences are written: it has a prompt, and can be edited and rendered. */
export const isWritten = (frame: StoryboardFrame) => frame.body !== ''

/** An upscale's stream: ends with the Session, the Frame now upscaled. */

export const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

/**
 * What a new Session starts from: a saved Scenario or a typed Brief, and the Scenario as the
 * Scenario page left it.
 */
export type SessionStart =
  & { kind: SessionKind; frameCount?: number; scenario?: Scenario }
  & ({ scenarioId: string; brief?: never } | { brief: string; scenarioId?: never })

export const createSession = (start: SessionStart) => post<Session>('/api/sessions', start)

export const getSession = (id: string) => request<Session>(`/api/sessions/${id}`)

/** Whether a Chain renders each Frame as it's made. */
/**
 * Switches a Session's Image Model, by name, to one a Backend listed can render, and the kind of
 * backend it would rather render on (ADR 0022); it comes back with its steps reset to that model's
 * default.
 */
export const setImageModel = <S>(id: string, imageModel: string, imageBackend?: ImageBackend) =>
  put<S>(`/api/sessions/${id}/image-model`, { imageModel, imageBackend })

/**
 * Switches a Session's Text Model, by name (ADR 0037); its Thinking stays as it started. What's
 * being written finishes on the old one, as do jobs queued before.
 */
export const setTextModel = <S>(id: string, textModel: string) =>
  put<S>(`/api/sessions/${id}/text-model`, { textModel })

/** Chooses the image that shows a Session on Home, or with null goes back to the newest picture. */
export const setThumbnail = (id: string, image: string | null) =>
  image === null
    ? request<Session>(`/api/sessions/${id}/thumbnail`, { method: 'DELETE' })
    : put<Session>(`/api/sessions/${id}/thumbnail`, { image })

/**
 * Deletes every picture by one Image Model in a Session, with its upscales and 3D (Compare's
 * hidden columns); not the Session's own model. It comes back with how many pictures went.
 */
export const deleteModelPictures = (id: string, imageModel: string) =>
  request<{ session: Session; deleted: number }>(
    `/api/sessions/${id}/pictures?imageModel=${encodeURIComponent(imageModel)}`,
    { method: 'DELETE' },
  )

/** A saved Session as listed on Home. */
export interface SessionSummary {
  id: string
  kind: SessionKind
  scenarioId: string | null
  /** The Scenario's title, or the start of the typed Brief. */
  title: string
  frames: number
  /** The image that shows it here: the one chosen, or else the newest picture. */
  thumbnail: string | null
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

/**
 * Undoes a Chain's Frames from `from` on, as the player saw it with Frame `latest` the latest, so a
 * repeat can't undo more; returns the updated Session.
 */
export const undoFrames = (id: string, from: number, latest: number) =>
  request<ChainSession>(`/api/sessions/${id}/frames/${from}?latest=${latest}`, { method: 'DELETE' })

/**
 * Deletes a Chain's Frame `index`, any but the Opening Frame, as the player saw the Chain: its
 * Frame count and the Frame's `createdAt`, so a repeat can't delete the next. Returns the updated
 * Session, the Frames after it numbered down.
 */
export const deleteChainFrame = (
  id: string,
  index: number,
  seen: { frames: number; createdAt: string },
) => post<ChainSession>(`/api/sessions/${id}/frames/${index}/delete`, seen)

export const put = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

/** Replaces a Storyboard Frame's own sentences, typed by hand, and who it shows. */
export const saveFrameBody = (id: string, index: number, body: string, shown: string[]) =>
  put<StoryboardSession>(`/api/sessions/${id}/frames/${index}`, { body, shown })

/** Replaces one Beat of a Storyboard's plan, and who it shows; only before its Frames are written. */
export const saveBeat = (id: string, index: number, beat: string, shown: string[]) =>
  put<StoryboardSession>(`/api/sessions/${id}/frames/${index}`, { beat, shown })

/**
 * Adds a Beat to a Storyboard's plan at `at` (0 to its number of Frames), the Frames from there on
 * moving up one; only before its Frames are written. Without `shown`, it shows who the Frame
 * before it does.
 */
export const insertBeat = (id: string, at: number, beat: string, shown?: string[]) =>
  post<StoryboardSession>(`/api/sessions/${id}/beats`, { at, beat, shown })

/**
 * Removes Beat `index` from a Storyboard's plan, the Frames after it moving down one; only before
 * its Frames are written. `seen` is the plan as shown, so a repeat can't remove the next Beat.
 */
export const removeBeat = (
  id: string,
  index: number,
  seen: { frames: number; createdAt: string },
) => post<StoryboardSession>(`/api/sessions/${id}/frames/${index}/delete`, seen)

/**
 * Puts a Storyboard's Beats in a new `order` (the index each had, in its new place); only before
 * its Frames are written. `seen` is their lines as shown, in the old order: a plan changed since
 * is refused.
 */
export const reorderBeats = (id: string, order: number[], seen: string[]) =>
  put<StoryboardSession>(`/api/sessions/${id}/beats/order`, { order, seen })

/**
 * Takes a Storyboard back to its plan (every Frame's sentences and pictures go), or a Roleplay back
 * to its Cast (every exchange goes, the opening too).
 */
export const restartSession = <S extends StoryboardSession | RoleplaySession>(id: string) =>
  post<S>(`/api/sessions/${id}/restart`)

/**
 * Makes a new Chain from a Storyboard's Frames up to `index`, with their pictures, to carry on
 * from that Frame by Actions; the Storyboard stays as it is.
 */
export const chainFromStoryboard = (id: string, index: number) =>
  post<ChainSession>(`/api/sessions/${id}/frames/${index}/chain`)

/** Replaces a Chain Frame's Image Prompt, typed by hand; its pictures are then out of date. */
export const saveChainPrompt = (id: string, index: number, prompt: string) =>
  put<ChainSession>(`/api/sessions/${id}/frames/${index}`, { prompt })

/** Replaces a Storyboard's Look; only before its Frames are written. */
export const saveLook = (id: string, look: Look) =>
  put<StoryboardSession>(`/api/sessions/${id}/look`, look)

export async function cancelFrame(id: string): Promise<void> {
  await fetch(`/api/sessions/${id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
}

export const imageUrl = (sessionId: string, file: string) =>
  `/api/sessions/${sessionId}/images/${file}`

/** Exports a Session's comparison as a page; it says where on the server the folder went. */
export const exportComparison = (id: string, comparison: ComparisonExport) =>
  post<{ folder: string; pictures: number }>(`/api/sessions/${id}/export`, comparison)

/**
 * The Compare dialog's style scores against Frame `base`, for these Image Models (ids), from the
 * pictures the last `style` job embedded; a 404 until there's been one.
 */
export const getStyleScores = (id: string, base: number, models: readonly string[]) =>
  request<StyleScores>(
    `/api/sessions/${id}/style-scores?base=${base}&models=${encodeURIComponent(models.join(','))}`,
  )

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

/**
 * Runs a Chain Frame (the Opening Frame when `action` is null), reporting its progress; `render`
 * off (this browser's switch) has it saved without its render queued.
 */
export const streamFrame = (
  sessionId: string,
  action: string | null,
  onEvent: (event: FrameEvent) => void,
  render = true,
) =>
  streamEvents<FrameEvent>(
    `/api/sessions/${sessionId}/frames`,
    { ...(action !== null && { action }), render },
    ['committed', 'declined', 'unclear', 'unchanged'],
    onEvent,
  )

/** Plans a Storyboard, reporting its Look and Beats as they arrive. */
export const planStoryboard = (sessionId: string, onEvent: (event: StoryboardEvent) => void) =>
  streamEvents<StoryboardEvent>(`/api/sessions/${sessionId}/plan`, {}, ['planned'], onEvent)

/** Writes a Storyboard's Frames from its reviewed plan, reporting each as it's saved. */
export const writeStoryboard = (sessionId: string, onEvent: (event: StoryboardEvent) => void) =>
  streamEvents<StoryboardEvent>(`/api/sessions/${sessionId}/write`, {}, ['written'], onEvent)

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

/** Every machine's queue, for the queue page (`GET /api/queue`). */
export interface Queue {
  /** The machines Settings list, `here` for the server's, with the kinds of Backend on each. */
  machines: { key: string; backends: string[] }[]
  /** The Sessions with jobs or text calls listed. */
  sessions: { id: string; kind: SessionKind; title: string }[]
  /** Every Session's jobs, each in its Session's order. */
  jobs: (Job & { sessionId: string })[]
  /** The Text Model's calls running, then waiting, on each machine, in the order they go. */
  text: {
    machine: string
    session?: string
    /** What it's for, as the call log names it (`reply`, `cast`…). */
    job: string
    status: 'running' | 'waiting'
    since: string
  }[]
}

export const getQueue = () => request<Queue>('/api/queue')

/** A Session's jobs (a Roleplay's or a Chain's), in the order queued; several may run, one per machine. */
export const listJobs = (id: string) => request<Job[]>(`/api/sessions/${id}/jobs`)

/** Queues a job on a Frame; returns the whole queue. Asking twice for the same job queues it once. */
export const queueJob = (id: string, kind: JobKind, frameIndex: number) =>
  post<Job[]>(`/api/sessions/${id}/jobs`, { kind, frameIndex })

/** Queues a clip of a Frame's picture (`ClipOrder`); returns the queue. */
export const queueClip = (id: string, frameIndex: number, clip: ClipOrder) =>
  post<Job[]>(`/api/sessions/${id}/jobs`, { kind: 'clip', frameIndex, clip })

/**
 * Has the Text Model write a clip's prompt for Frame `index`, for the player to edit; nothing is
 * saved. With `revise`, it rewrites the prompt a clip was made from, by what was wrong with it.
 */
export const writeClipPrompt = (
  id: string,
  index: number,
  ask: ClipAsk,
  onEvent: (event: ClipPromptEvent | EndEvent) => void,
  revise?: { prompt: string; problem: string },
) =>
  streamEvents<ClipPromptEvent>(
    `/api/sessions/${id}/frames/${index}/clip-prompt`,
    { ...ask, ...(revise && { revise }) },
    ['clip-prompt'],
    onEvent,
  )

/** Queues an edit of a Frame's picture (`EditOrder`); returns the queue. */
export const queueEdit = (id: string, frameIndex: number, edit: EditOrder) =>
  post<Job[]>(`/api/sessions/${id}/jobs`, { kind: 'edit', frameIndex, edit })

/** Picks which version of a Frame's picture is the picture (0 for its render); returns the Session. */
export const pickVersion = <S>(id: string, index: number, picked: number) =>
  put<S>(`/api/sessions/${id}/pictures/${index}/picked`, { picked })

/** Deletes edit `version` of a Frame's picture, the newest by its edit model; returns the Session. */
export const deleteNewestEdit = <S>(id: string, index: number, version: number) =>
  request<S>(`/api/sessions/${id}/pictures/${index}/edits/${version}`, { method: 'DELETE' })

/** Deletes the upscale of a Frame's shown picture, keeping the picture; returns the Session. */
export const deleteUpscale = <S>(id: string, index: number) =>
  request<S>(`/api/sessions/${id}/pictures/${index}/upscale`, { method: 'DELETE' })

/** Puts a failed job back in the queue; returns the queue. */
export const retryJob = (id: string, jobId: string) =>
  post<Job[]>(`/api/sessions/${id}/jobs/${jobId}/retry`)

/** Cancels a queued or running job, or dismisses a failed or done one; returns the queue. */
export const cancelJob = (id: string, jobId: string) =>
  request<Job[]>(`/api/sessions/${id}/jobs/${jobId}`, { method: 'DELETE' })

/** Cancels everything running and queued in a Session; what's finished stays. Returns the queue. */
export const cancelAllJobs = (id: string) =>
  request<Job[]>(`/api/sessions/${id}/jobs`, { method: 'DELETE' })

/** Dismisses a Session's finished jobs, done and failed, leaving the rest; returns the queue. */
export const dismissFinishedJobs = (id: string) =>
  request<Job[]>(`/api/sessions/${id}/jobs/finished`, { method: 'DELETE' })

/** Settings as the browser has them: what's stored, and the API keys' two one-way fields. */
export type Settings = StoredSettings & {
  /** From the server: the Backends with an API key saved (the keys are never sent back). */
  apiKeysSet?: string[]
  /** Sent only to replace Backends' saved API keys, by id; '' removes one. */
  apiKeys?: Record<string, string>
}

/** What loading a Session adds to what's stored (only from `getSession`). */
export interface Loaded {
  /** Its Scenario's title, or the start of its typed Brief. */
  title?: string
  /** What work in progress is doing (speaking a line is `audio`), or null when idle. */
  activity?: Phase | null
  /** Which Frame that work is on, for Storyboards. */
  activeFrame?: number | null
  /** The size its pictures render at, from its Settings. */
  imageSize?: { width: number; height: number }
}
export type SessionBase = StoredSessionBase & Loaded
export type ChainSession = StoredChainSession & Loaded
export type StoryboardSession = StoredStoryboardSession & Loaded
export type Session = ChainSession | StoryboardSession | RoleplaySession

/** A job as the browser is sent it. */
export type Job = StoredJob

export type FrameEvent = StoredFrameEvent | EndEvent
export type StoryboardEvent = StoredStoryboardEvent | EndEvent

/** A folder to move to, checked: a folder that can't be used is answered as an error instead. */
export type FolderCheck = Extract<StoredFolderCheck, { ok: true }>
