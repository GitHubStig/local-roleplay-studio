import type { SessionStore } from '../session.ts'
import { GoneError, updateSession as update } from '../update.ts'
import type { RoleplaySession } from './types.ts'

export { GoneError }

/** Saves a change to a Roleplay, onto its latest state (see `updateSession` in update.ts). */
export const updateSession = (
  store: SessionStore,
  id: string,
  change: (session: RoleplaySession) => RoleplaySession,
): Promise<RoleplaySession> => update(store, id, 'roleplay', change)
