import {
  type Activity,
  type EndEvent,
  type Figure,
  type Look,
  type Picture,
  type ProgressEvent,
  put,
  request,
  type Scene,
  type SessionBase,
  streamEvents,
} from '../api'

export type { Figure, Scene }
export { cancelJob, type Job, type JobKind, listJobs, queueJob, retryJob } from '../api'

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
  /** The Image Prompt crosses a Limit. */
  blocked?: string
  /** Who the picture shows. */
  /** Who the picture shows, by their names in the Look; none for the place alone. */
  shown?: string[]
  clothing?: string
  /** For debugging: how long the latest picture took, and the Art Agent's reasoning. */
  pictureTimings?: { text: number }
  /** The model that wrote the latest picture. */
  pictureModel?: string
  /** Written as tags (Settings → Art Agent style); absent for prose. */
  pictureStyle?: 'tags'
  pictureThinking?: string
  /** One per Image Model it was rendered with, oldest first; none until rendered. */
  pictures: Picture[]
  /** The Character's line, spoken; in an earlier voice when `speech.ref` isn't the voice's now. */
  speech?: Speech
  /** The Character's thought, spoken (whispered) in the same voice. */
  thoughtSpeech?: Speech
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
  /** Why directing failed, when it was spoken as written instead. */
  undirected?: string
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
  /**
   * Each person's identity and the art style, shared by every picture: written from the Cast when
   * one is first pictured, joined by anyone the story brings into a picture.
   */
  look?: Look | null
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
  | { type: 'look'; look: Look }
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

/** Replaces the Look, rewriting every pictured Frame's Image Prompt. */
export const saveLook = (id: string, look: Look) => put<RoleplaySession>(`${base(id)}/look`, look)

/** Replaces the voice description; the voice is designed again from it. */
export const saveVoice = (id: string, description: string) =>
  put<RoleplaySession>(`${base(id)}/voice`, { description })

/** Replaces the Cast; applies from the next reply. */
export const saveCast = (id: string, cast: Cast) => put<RoleplaySession>(`${base(id)}/cast`, cast)
