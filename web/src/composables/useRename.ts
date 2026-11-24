import { nextTick, type Ref, ref, type ShallowRef } from 'vue'
import { renameSession } from './useSessionList'

/**
 * Renaming a Session by clicking its title, wherever it's shown (the Session bar, the Session
 * manager): `edit` turns the title into a field, `save` (Enter, or clicking away) saves what's
 * typed unless it's blank or unchanged, `cancel` (Escape) puts it back. The new title shows at once,
 * and goes back if the server refuses it, saying why (`failed`).
 */
export function useRename(
  id: () => string,
  title: Ref<string>,
  field: Readonly<ShallowRef<HTMLInputElement | null>>,
) {
  const editing = ref(false)
  const draft = ref('')
  const failed = ref('')

  async function edit() {
    draft.value = title.value
    failed.value = ''
    editing.value = true
    await nextTick()
    field.value?.select()
  }

  async function save() {
    if (!editing.value) return
    editing.value = false
    const next = draft.value.trim()
    if (!next || next === title.value) return
    const before = title.value
    title.value = next
    try {
      title.value = (await renameSession<{ title: string }>(id(), next)).title
    } catch (err) {
      title.value = before
      failed.value = `Couldn't rename it: ${(err as Error).message}`
    }
  }

  const cancel = () => (editing.value = false)

  return { editing, draft, failed, edit, save, cancel }
}
