import { type Ref, ref } from 'vue'
import { deleteNewestEdit, deleteUpscale as deleteUpscaleOf, pickVersion } from '../api'

/**
 * Editing a Frame's picture in the viewer (ADR 0021), for any kind of Session: opening it to paint
 * an edit or to watch one being made, picking which version is the picture, and deleting its
 * newest edit, or its upscale. `viewing` is the screen's Frame open in the viewer; picking and deleting save at
 * once and send back the Session, which replaces the one on screen. `onError` hears why one was
 * refused.
 */
export function usePictureEditing<S>(
  sessionId: string,
  session: Ref<S | null>,
  viewing: Ref<number | null>,
  onError: (message: string) => void,
) {
  /** Painting an edit in the viewer. */
  const painting = ref(false)
  /** Edit: the viewer on Frame `index`, painting a new edit, or on the edit being made if any. */
  function startEdit(index: number) {
    viewing.value = index
    painting.value = true
  }
  /** The viewer on Frame `index`, on its edit being made (from the Queue). */
  function showEdit(index: number) {
    painting.value = false
    viewing.value = index
  }
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
  async function deleteUpscale(index: number) {
    try {
      session.value = await deleteUpscaleOf<S>(sessionId, index)
    } catch (err) {
      onError((err as Error).message)
    }
  }
  return { painting, startEdit, showEdit, pick, deleteEdit, deleteUpscale }
}
