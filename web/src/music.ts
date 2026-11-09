import type { SessionSettings, Settings } from './api'

/** Music's Behaviour, each a sentence the music's Text Model calls are given. */
export const MUSIC_BEHAVIOURS = [
  { id: 'steady', label: 'Steady', about: 'few changes, kept low and in the background' },
  { id: 'story', label: 'Follows the story', about: 'changes as the story turns' },
  { id: 'cinematic', label: 'Cinematic', about: 'changes readily, and comes forward' },
] as const

/** A Session's music settings, as its Music tab edits them. */
export interface MusicSettings {
  behaviour: Settings['musicBehaviour']
  taste: string
}

/** A Session's own music settings. */
export const musicSettingsOf = (session: SessionSettings): MusicSettings => ({
  behaviour: session.musicBehaviour,
  taste: session.musicTaste,
})
