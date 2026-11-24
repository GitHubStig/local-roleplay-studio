/**
 * What a Session holds and how big it is, as the Session manager shows it. Shared by the server
 * and the web app: types and plain values only.
 */

/**
 * The parts a Session's files belong to (`server/sessionParts.ts`), in the order the size bar shows
 * them. Its text (`session.json`) and the caches the app makes again belong to none.
 */
export const SESSION_PARTS = ['pictures', 'clips', '3d', 'sound', 'calls'] as const

export type SessionPart = (typeof SESSION_PARTS)[number]

export const PART_LABELS: Record<SessionPart, string> = {
  pictures: 'Pictures',
  clips: 'Clips',
  '3d': '3D',
  sound: 'Sound',
  calls: 'Call logs',
}

/** How many of each thing a Session holds, counted from its records (and its call logs). */
export interface SessionCounts {
  frames: number
  /** A Frame's picture by one Image Model: its render, with its edits and what was made from it. */
  pictures: number
  /** How many Image Models made them. */
  imageModels: number
  edits: number
  /** Video clips, of every kind and video model. */
  clips: number
  /** A Roleplay's spoken lines and spoken thoughts. */
  speech: number
  /** SHARP scenes and TripoSplat and LiTo figures. */
  threeD: number
  /** A Roleplay's music: its Cues that have a track. */
  cues: number
  /** The calls logged (Settings' call log), every Frame's and the setup's. */
  calls: number
}

/** What a Session holds (`GET /api/sessions/:id/contents`), worked out when asked, not cached. */
export interface SessionContents {
  /** Bytes on disk, every file in its folder. */
  size: number
  /** Bytes per part. */
  parts: Record<SessionPart, number>
  /** Bytes in no part: its text (`session.json`) and caches (thumbnails, style scores). */
  rest: number
  counts: SessionCounts
}

/** Each Session's size on disk in bytes, by id (`GET /api/session-sizes`). */
export type SessionSizes = Record<string, number>
