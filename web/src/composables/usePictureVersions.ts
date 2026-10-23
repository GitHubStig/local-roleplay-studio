import type { Ref } from 'vue'
import { deleteNewestEdit, pickVersion } from '../api'

/**
 * Picking which version of a Frame's picture is the picture, and deleting its newest edit (ADR
 * 0021), for any kind of Session: each saves at once and sends back the Session, which replaces
 * the one on screen. `onError` hears why one was refused.
 */
export function usePictureVersions<S>(
  sessionId: string,
  session: Ref<S | null>,
  onError: (message: string) => void,
) {
  async function pick(index: number, version: number) {
    try {
      session.value = await pickVersion<S>(sessionId, index, version)
    } catch (err) {
      onError((err as Error).message)
    }
  }
  async function deleteEdit(index: number) {
    try {
      session.value = await deleteNewestEdit<S>(sessionId, index)
    } catch (err) {
      onError((err as Error).message)
    }
  }
  return { pick, deleteEdit }
}
