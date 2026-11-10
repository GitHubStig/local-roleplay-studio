import {
  type EndEvent,
  type Figure,
  type Loaded,
  type Look,
  put,
  request,
  type Scene,
  streamEvents,
} from '../api'

import type { MusicSettings } from '../music'
import type { RoleplayEvent as StoredRoleplayEvent } from '../../../shared/events.ts'
export {
  type Cast,
  type Character,
  type Cue,
  type CueTrack,
  type CueValues,
  type FrameMusic,
  type Persona,
  type Reply,
  type RoleplayFrame,
  type RoleplayVoice,
  type Score,
  type Setting,
  type Speech,
} from '../../../shared/roleplay.ts'
import type {
  Cast,
  RoleplaySession as StoredRoleplaySession,
  Score,
} from '../../../shared/roleplay.ts'

export type { Figure, Scene }
export { cancelJob, type Job, type JobKind, listJobs, queueJob, retryJob } from '../api'

/** The tempo range a Score may set, in beats per minute, as the server holds it. */
export const TEMPO = { slowest: 40, fastest: 200 }

const base = (id: string) => `/api/sessions/${id}/roleplay`

/**
 * What this browser's switches ask to follow a Reply: its line spoken (autoplay) and its picture
 * rendered. The server queues them, after its picture, as it saves the Reply.
 */
export interface ReplySwitches {
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
  after: ReplySwitches,
  onEvent: (event: RoleplayEvent) => void,
) => streamEvents<RoleplayEvent>(`${base(id)}/begin`, after, ['replied'], onEvent)

/** Sends the player's message; ends with the reply, or `declined` if it crossed a Limit. */
export const sendMessage = (
  id: string,
  text: string,
  after: ReplySwitches,
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

/** A Roleplay as loaded: what's stored, and what loading adds. */
export type RoleplaySession = StoredRoleplaySession & Loaded

export type RoleplayEvent = StoredRoleplayEvent | EndEvent
