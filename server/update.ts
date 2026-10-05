import type { Session, SessionStore } from './session.ts'

/** A Session (or a Frame of it) that went away while something was still working on it. */
export class GoneError extends Error {}

/** The latest save of each Session, so saves to one Session run one after another. */
const saving = new Map<string, Promise<unknown>>()

const NAMES: Record<Session['kind'], string> = {
  chain: 'Chain',
  storyboard: 'Storyboard',
  roleplay: 'Roleplay',
}

/**
 * Saves a change to a Session of `kind`: loads its latest state, applies `change`, and saves the
 * result, one change at a time per Session. Background work (pictures, renders, upscales, 3D) runs
 * beside the Session's own work (the conversation, a Chain's next Frame), so each applies only its
 * own change to what's saved now, never to a copy read before the other finished.
 */
export function updateSession<K extends Session['kind']>(
  store: SessionStore,
  id: string,
  kind: K,
  change: (session: Extract<Session, { kind: K }>) => Extract<Session, { kind: K }>,
): Promise<Extract<Session, { kind: K }>> {
  type S = Extract<Session, { kind: K }>
  const run = async () => {
    const current = await store.load(id)
    if (!current || current.kind !== kind) {
      throw new GoneError(`This ${NAMES[kind]} no longer exists`)
    }
    const next = change(current as S)
    await store.save(next)
    return next
  }
  const result = (saving.get(id) ?? Promise.resolve()).then(run, run)
  saving.set(id, result.catch(() => {}))
  return result
}
