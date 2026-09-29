import {
  type EndEvent,
  type Look,
  post,
  type ProgressEvent,
  put,
  request,
  type SessionBase,
  streamEvents,
} from '../api'

/** Who the Text Model plays. */
export interface Character {
  name: string
  age: number
  appearance: string
  personality: string
  voice: string
  background: string
  goal: string
}

/** Who the player plays. */
export interface Persona {
  name: string
  role: string
  appearance: string
}

/** Where and when the scene starts. */
export interface Setting {
  place: string
  time: string
  weather: string
}

export interface Cast {
  character: Character
  persona: Persona
  setting: Setting
}

/** Each person's identity sentence and the art style, shared by every picture. */
export interface RoleplayLook {
  character: string
  persona: string
  style: string
}

/** Who a picture shows. */
export type Shown = 'both' | 'character' | 'persona' | 'none'

/** The Character's reply: a thought, what they do, what they say. */
export interface Reply {
  internal: string
  actions: string
  dialogue: string
}

/** One exchange; the Opening Frame has no message, since the Character speaks first. */
export interface RoleplayFrame {
  index: number
  message: string | null
  reply: Reply
  thinking?: string
  timings?: { text: number }
  /** Once pictured: the picture's seven sentences and its Image Prompt, not yet rendered. */
  body?: string
  prompt?: string
  promptText?: string
  /** The Image Prompt crosses a Limit. */
  blocked?: string
  /** Who the picture shows. */
  shown?: Shown
  clothing?: string
  /** The rendered picture's upscale. */
  upscaled?: string
  /** The Image Prompt changed since the picture was rendered. */
  stale?: boolean
  renderTimings?: { queued?: number; image: number | null }
  /** For debugging: how long the latest picture took, and the Art Agent's reasoning. */
  pictureTimings?: { text: number }
  /** The model that wrote the latest picture. */
  pictureModel?: string
  /** Written as tags (Settings → Art Agent style); absent for prose. */
  pictureStyle?: 'tags'
  pictureThinking?: string
  /** The rendered picture; null until rendered. */
  image: string | null
  createdAt: string
}

export interface RoleplaySession extends SessionBase {
  kind: 'roleplay'
  /** Null until set up. */
  cast: Cast | null
  /** Who is shown and in what style in every picture; written when one is first pictured. */
  /** A single-sentence `subject` Look is from before pictures chose who is shown. */
  look?: RoleplayLook | Look | null
  lookTimings?: { text: number }
  lookThinking?: string
  frames: RoleplayFrame[]
}

export type RoleplayEvent =
  | ProgressEvent
  | EndEvent
  | { type: 'cast'; cast: Cast; session: RoleplaySession }
  | { type: 'reply-part'; key: keyof Reply; value: string }
  | { type: 'replied'; frame: RoleplayFrame; session: RoleplaySession }
  | { type: 'declined'; message: string }
  | { type: 'look'; look: RoleplayLook }

const base = (id: string) => `/api/sessions/${id}/roleplay`

/** Writes (or, before the scene begins, rewrites) the Cast from the Brief, for review. */
export const writeCast = (id: string, onEvent: (event: RoleplayEvent) => void) =>
  streamEvents<RoleplayEvent>(`${base(id)}/cast`, {}, ['cast'], onEvent)

/** Begins the scene: the Character's opening Reply, from the Cast as it stands. */
export const beginRoleplay = (id: string, onEvent: (event: RoleplayEvent) => void) =>
  streamEvents<RoleplayEvent>(`${base(id)}/begin`, {}, ['replied'], onEvent)

/** Sends the player's message; ends with the reply, or `declined` if it crossed a Limit. */
export const sendMessage = (id: string, text: string, onEvent: (event: RoleplayEvent) => void) =>
  streamEvents<RoleplayEvent>(`${base(id)}/messages`, { text }, ['replied', 'declined'], onEvent)

/** Removes the latest exchange. */
export const undoExchange = (id: string, index: number) =>
  request<RoleplaySession>(`${base(id)}/frames/${index}`, { method: 'DELETE' })

/** Background work on a Frame: picturing, rendering or upscaling it. */
export type JobKind = 'picture' | 'render' | 'upscale'

/** A queued, running or failed job. Finished jobs drop off the list. */
export interface Job {
  id: string
  kind: JobKind
  frameIndex: number
  status: 'queued' | 'running' | 'failed'
  phase?: 'text' | 'queued' | 'image'
  progress?: { step: number; total: number }
  error?: string
  createdAt: string
}

/** The Roleplay's jobs: running, then queued in order, then failed. */
export const listJobs = (id: string) => request<Job[]>(`${base(id)}/jobs`)

/** Queues a job on a Frame; returns the whole queue. Asking twice for the same job queues it once. */
export const queueJob = (id: string, kind: JobKind, frameIndex: number) =>
  post<Job[]>(`${base(id)}/jobs`, { kind, frameIndex })

/** Puts a failed job back in the queue; returns the queue. */
export const retryJob = (id: string, jobId: string) =>
  post<Job[]>(`${base(id)}/jobs/${jobId}/retry`)

/** Cancels a queued or running job, or dismisses a failed one; returns the queue. */
export const cancelJob = (id: string, jobId: string) =>
  request<Job[]>(`${base(id)}/jobs/${jobId}`, { method: 'DELETE' })

/** Replaces the Look, rewriting every pictured Frame's Image Prompt. */
export const saveLook = (id: string, look: RoleplayLook) =>
  put<RoleplaySession>(`${base(id)}/look`, look)

/** Replaces the Cast; applies from the next reply. */
export const saveCast = (id: string, cast: Cast) => put<RoleplaySession>(`${base(id)}/cast`, cast)
