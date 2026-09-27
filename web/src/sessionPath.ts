import type { SessionKind } from './api'

const SCREENS: Record<SessionKind, string> = {
  chain: '/sessions',
  storyboard: '/storyboards',
  roleplay: '/roleplay',
}

/** Where a Session's screen lives: each kind has its own. */
export const sessionPath = (id: string, kind: SessionKind = 'chain') => `${SCREENS[kind]}/${id}`
