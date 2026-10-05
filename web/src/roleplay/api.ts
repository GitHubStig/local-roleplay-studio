import {
  type Activity,
  type EndEvent,
  type Figure,
  type Look,
  post,
  type ProgressEvent,
  put,
  request,
  type Scene,
  type SessionBase,
  streamEvents,
} from '../api'

export type { Figure, Scene }

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
  /** The Character's line, spoken; in an earlier voice when `speech.ref` isn't the voice's now. */
  speech?: Speech
  /** The Character's thought, spoken (whispered) in the same voice. */
  thoughtSpeech?: Speech
  /** The picture as a 2.5D scene; a re-render drops it. */
  scene?: Scene
  /** The person in the picture lifted out as a 3D figure (TripoSplat); a re-render drops it. */
  figure?: Figure
  /** The same, made with Apple's LiTo; a re-render drops it. */
  lito?: Figure
  createdAt: string
}

/** A Frame's dialogue spoken in the Character's voice. */
export interface Speech {
  file: string
  /** The reference clip of the voice it was spoken in. */
  ref: string
  timings: { queued?: number; audio: number }
  /** How it was directed; absent if it was spoken as written. */
  delivery?: { pace: 'normal' | 'slow' | 'fast'; sound: 'none' | 'sigh' | 'laughter' | 'cough' }
}

/** The Character's voice: a description, and the reference clip designed from it (once designed). */
export interface RoleplayVoice {
  description: string
  ref?: string
  model?: string
}

export interface RoleplaySession extends Omit<SessionBase, 'activity'> {
  kind: 'roleplay'
  /** Null until set up. */
  cast: Cast | null
  /** Who is shown and in what style in every picture; written when one is first pictured. */
  /** A single-sentence `subject` Look is from before pictures chose who is shown. */
  look?: RoleplayLook | Look | null
  lookTimings?: { text: number }
  lookThinking?: string
  voice?: RoleplayVoice
  /** As for any Session, or speaking a line (audio). */
  activity?: Activity | 'audio' | null
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
  /** Suggest: the message as written so far, then the whole of it, tidied. */
  | { type: 'suggestion-part'; text: string }
  | { type: 'suggestion'; text: string }

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

/**
 * Writes a message for the player to edit or send, from the story and what they've typed so far
 * (`draft`, if any). Nothing is saved.
 */
export const suggestMessage = (
  id: string,
  draft: string,
  onEvent: (event: RoleplayEvent) => void,
) => streamEvents<RoleplayEvent>(`${base(id)}/suggest`, { draft }, ['suggestion'], onEvent)

/** Removes the latest exchange. */
export const undoExchange = (id: string, index: number) =>
  request<RoleplaySession>(`${base(id)}/frames/${index}`, { method: 'DELETE' })

/**
 * Background work on a Frame: picturing, rendering, upscaling or speaking it, making its picture
 * into a 2.5D scene (SHARP), or lifting its person out as a 3D figure (TripoSplat); `voice`
 * designs a new take of the Character's voice (filed under the opening Frame).
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

/** Replaces the voice description; the voice is designed again from it. */
export const saveVoice = (id: string, description: string) =>
  put<RoleplaySession>(`${base(id)}/voice`, { description })

/** Replaces the Cast; applies from the next reply. */
export const saveCast = (id: string, cast: Cast) => put<RoleplaySession>(`${base(id)}/cast`, cast)
