import { deleteSession as sendDelete, type SessionSummary } from '../api'
import { ask } from '../ask'
import { clearCurrentSession } from './useCurrentSession'
import { forgetSession } from './useSessionList'

/**
 * Deletes Session `s` once the player says yes (`ask`, naming it): from the server, the shared
 * Session list, Current Session and the draft kept for it. True if it went.
 */
export async function deleteSessionAsked(s: SessionSummary): Promise<boolean> {
  const what = `${s.title}, ${s.frames} ${s.frames === 1 ? 'Frame' : 'Frames'}`
  const question = `Delete this Session (${what}) and everything made in it? This can't be undone.`
  if (!(await ask(question, { action: 'Delete', danger: true }))) return false
  await sendDelete(s.id)
  forgetSession(s.id)
  clearCurrentSession(s.id)
  try {
    localStorage.removeItem(`draft:${s.id}`)
  } catch {
    // Nothing stored.
  }
  return true
}
