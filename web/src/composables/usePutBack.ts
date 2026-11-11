import { type Ref, ref } from 'vue'

/** Text Undo couldn't put back in the box, as it held a draft, and what it's called. */
export interface Offered {
  label: string
  text: string
}

/**
 * Puts an undone Frame's Action or Message back in the text box (`draft`). A draft already there
 * stays, and what was undone is offered beside it instead, to swap in with `use`, which offers the
 * draft in its place: nothing typed is overwritten, and nothing undone is lost without a word.
 */
export function usePutBack(draft: Ref<string>) {
  const offered = ref<Offered | null>(null)

  function putBack(label: string, text: string | null | undefined) {
    offered.value = null
    if (!text) return
    if (!draft.value.trim()) draft.value = text
    else if (draft.value.trim() !== text.trim()) offered.value = { label, text }
  }

  function use() {
    if (!offered.value) return
    const typed = draft.value
    draft.value = offered.value.text
    offered.value = typed.trim() ? { label: 'Your draft', text: typed } : null
  }

  return { offered, putBack, use, dismiss: () => (offered.value = null) }
}
