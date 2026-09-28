import type { SessionStore } from '../session.ts'
import type { RoleplaySession } from './types.ts'

/** A Roleplay that was deleted while something was still working on it. */
export class GoneError extends Error {}

/** The latest save of each Roleplay, so saves to one Roleplay run one after another. */
const saving = new Map<string, Promise<unknown>>()

/**
 * Saves a change to a Roleplay: loads its latest state, applies `change`, and saves the result,
 * one change at a time per Roleplay. Background work (pictures, renders, upscales) and the
 * conversation run side by side, so each applies only its own change to what's saved now, never to
 * a copy read before the other finished.
 */
export function updateSession(
  store: SessionStore,
  id: string,
  change: (session: RoleplaySession) => RoleplaySession,
): Promise<RoleplaySession> {
  const run = async () => {
    const current = await store.load(id)
    if (!current || current.kind !== 'roleplay') {
      throw new GoneError('This Roleplay no longer exists')
    }
    const next = change(current)
    await store.save(next)
    return next
  }
  const result = (saving.get(id) ?? Promise.resolve()).then(run, run)
  saving.set(id, result.catch(() => {}))
  return result
}
