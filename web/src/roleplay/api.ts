import {
  type EndEvent,
  type Look,
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
export type Shown = 'both' | 'character' | 'persona'

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
  | { type: 'pictured'; frame: RoleplayFrame; session: RoleplaySession }
  | { type: 'rendered'; frame: RoleplayFrame; session: RoleplaySession }

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

/** Pictures a Frame with the Art Agent: its Image Prompt (and the Look, the first time). */
export const pictureFrame = (
  id: string,
  index: number,
  onEvent: (event: RoleplayEvent) => void,
) => streamEvents<RoleplayEvent>(`${base(id)}/frames/${index}/picture`, {}, ['pictured'], onEvent)

/** Renders a pictured Frame through the shared render queue. */
export const renderFrame = (
  id: string,
  index: number,
  onEvent: (event: RoleplayEvent) => void,
) => streamEvents<RoleplayEvent>(`${base(id)}/frames/${index}/render`, {}, ['rendered'], onEvent)

/** Replaces the Look, rewriting every pictured Frame's Image Prompt. */
export const saveLook = (id: string, look: RoleplayLook) =>
  put<RoleplaySession>(`${base(id)}/look`, look)

/** Replaces the Cast; applies from the next reply. */
export const saveCast = (id: string, cast: Cast) => put<RoleplaySession>(`${base(id)}/cast`, cast)
