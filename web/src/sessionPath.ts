import type { SessionKind } from './api'

/** Where a Session's screen lives: Chains and Storyboards each have their own. */
export const sessionPath = (id: string, kind: SessionKind = 'chain') =>
  kind === 'storyboard' ? `/storyboards/${id}` : `/sessions/${id}`
