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

import type { MusicSettings } from '../music'

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
  /** What holds whatever anyone does. */
  truths: string[]
  /** The story's other People, a line each, who may act and speak briefly; none in a story of two. */
  others: string[]
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
  timings: { text: number }
  /** The Text Model that wrote the Reply, as a Session can switch (ADR 0037). */
  textModel: string
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
  pictureThinking?: string
  /** One per Image Model it was rendered with, oldest first; none until rendered. */
  pictures: Picture[]
  /** The Character's line, spoken; in an earlier voice when `speech.ref` isn't the voice's now. */
  speech?: Speech
  /** The Character's thought, spoken (whispered) in the same voice. */
  thoughtSpeech?: Speech
  /** How the music was directed at this Frame, once it has been. */
  music?: FrameMusic
  createdAt: string
}

/** The Music Director's reading of a Frame, and what it decided. */
export interface FrameMusic {
  /** The Cue it plays under (`Cue.id`). */
  cue: string
  reading: string
  decision: 'continue' | 'transition' | 'silence'
  /** How a change came in; meaningless when the music continued. */
  entry: 'gentle' | 'sharp'
  /** The line that caused a change, quoted; '' when it continued. */
  line: string
  model: string
  timings: { text: number }
  /** Directed by Score the Roleplay, with hindsight; its timings are the cue writer's alone. */
  hindsight?: true
  /** A short accent placed here with hindsight, over the music playing (not played yet). */
  stinger?: { reading: string; line: string }
}

/** What the cue writer picked for a Cue, within the Score. */
export interface CueValues {
  mood: string
  energy: 'calm' | 'restrained' | 'building' | 'intense'
  density: 'sparse' | 'layered' | 'full'
  tempo: 'slow' | 'moderate' | 'fast'
  instruments: string[]
  vocals: 'none' | 'choir'
  shape: 'intimate' | 'uneasy' | 'reflective' | 'sacred' | 'danger'
  key: string
  /** What the music model is told it sounds like and how it develops. */
  caption: string
  /** Section tags following the caption, with lines of vowels for any voices to sing. */
  lyrics: string
}

/** A Cue's music, once made. */
export interface CueTrack {
  file: string
  seconds: number
  bpm: number
  seed: number
  timings: { queued?: number; music: number }
}

/** A stretch of music from the Frame it began on until the next Cue: its values, or silence. */
export interface Cue {
  id: string
  start: number
  values?: CueValues
  entry: 'gentle' | 'sharp'
  reading: string
  line: string
  /** What the player asked of it. */
  steer?: string
  /** Its music, once made. */
  track?: CueTrack
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
  look: Look | null
  lookTimings?: { text: number }
  lookThinking?: string
  voice?: RoleplayVoice
  /** The music's identity, shared by every Cue: absent until written. */
  score?: Score
  scoreTimings?: { text: number }
  scoreModel?: string
  scoreThinking?: string
  /** The music's Cues, in the order of the Frames they began on. */
  cues: Cue[]
  /** The last time the whole Roleplay was scored with hindsight. */
  hindsight?: { model: string; chunks: number; courses: string[]; timings: { text: number } }
  /** As for any Session, or speaking a line (audio). */
  activity?: Activity | 'audio' | null
  frames: RoleplayFrame[]
}

/** A Roleplay's musical identity: what every Cue is made in. */
export interface Score {
  genre: string
  /** The instruments its Cues are drawn from. */
  palette: string[]
  atmosphere: string
  /** In beats per minute. */
  tempo: { slowest: number; fastest: number }
  /** What its Cues never use; never sent to a music model. */
  avoid: string[]
}

/** The tempo range a Score may set, in beats per minute, as the server holds it. */
export const TEMPO = { slowest: 40, fastest: 200 }

export type RoleplayEvent =
  | ProgressEvent
  | EndEvent
  | { type: 'cast'; cast: Cast; session: RoleplaySession }
  | { type: 'reply-part'; key: keyof Reply; value: string }
  | { type: 'replied'; frame: RoleplayFrame; session: RoleplaySession }
  | { type: 'declined'; message: string }
  | { type: 'look'; look: Look }
  | { type: 'score'; score: Score; session: RoleplaySession }
  | { type: 'directed'; frame: RoleplayFrame; session: RoleplaySession }
  /** Suggest: the message as written so far, then the whole of it, tidied. */
  | { type: 'suggestion-part'; text: string }
  | { type: 'suggestion'; text: string }

const base = (id: string) => `/api/sessions/${id}/roleplay`

/**
 * What this browser's switches ask to follow a Reply: its line spoken (autoplay) and its picture
 * rendered. The server queues them, after its picture, as it saves the Reply.
 */
export interface AfterReply {
  speak: boolean
  render: boolean
  /** Its music directed (Score as you play, while Music is on). */
  direct: boolean
}

/** Writes (or, before the scene begins, rewrites) the Cast from the Brief, for review. */
export const writeCast = (id: string, onEvent: (event: RoleplayEvent) => void) =>
  streamEvents<RoleplayEvent>(`${base(id)}/cast`, {}, ['cast'], onEvent)

/** Begins the scene: the Character's opening Reply, from the Cast as it stands. */
export const beginRoleplay = (
  id: string,
  after: AfterReply,
  onEvent: (event: RoleplayEvent) => void,
) => streamEvents<RoleplayEvent>(`${base(id)}/begin`, after, ['replied'], onEvent)

/** Sends the player's message; ends with the reply, or `declined` if it crossed a Limit. */
export const sendMessage = (
  id: string,
  text: string,
  after: AfterReply,
  onEvent: (event: RoleplayEvent) => void,
) =>
  streamEvents<RoleplayEvent>(
    `${base(id)}/messages`,
    { text, ...after },
    ['replied', 'declined'],
    onEvent,
  )

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

/** Writes the Score, or writes it again, from the Cast, the Brief and the tastes (Music on). */
export const writeScore = (id: string, onEvent: (event: RoleplayEvent) => void) =>
  streamEvents<RoleplayEvent>(`${base(id)}/score`, {}, ['score'], onEvent)

/** Replaces the Score, edited by hand. */
export const saveScore = (id: string, score: Score) =>
  put<RoleplaySession>(`${base(id)}/score`, score)

/** Replaces the Roleplay's own Behaviour, Vocals and Music taste. */
/** Keeps what the player asks of a Cue; a `steer` job then writes it again. */
export const saveCueSteer = (id: string, cue: string, steer: string) =>
  put<RoleplaySession>(`${base(id)}/cues/${cue}/steer`, { steer })
export const saveMusicSettings = (id: string, music: MusicSettings) =>
  put<RoleplaySession>(`${base(id)}/music`, music)
