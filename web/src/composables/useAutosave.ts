import { tryOnBeforeUnmount, useEventListener } from '@vueuse/core'
import { computed, getCurrentInstance, onDeactivated, type Ref, ref, watch } from 'vue'

export interface AutosaveOptions<T> {
  /** What's saved now; null while there's nothing to edit. */
  source: () => T | null
  /**
   * Which thing is edited (a Frame's index). When it changes, the draft starts again from the
   * new one's, after the old draft is saved to the old one.
   */
  key?: () => unknown
  /** Saves `draft` to `key`, returning it as saved (tidied by the server). Throws if refused. */
  save: (draft: T, key: unknown) => Promise<T>
  /** Why `draft` can't be saved yet (a person without a name), or null if it can. */
  hold?: (draft: T) => string | null
  /** The draft as compared with what's saved, e.g. trimmed. */
  normal?: (value: T) => unknown
  /** What `key` is called, for a save to it refused after moving on to another: "Frame 3". */
  name?: (key: unknown) => string
  /** The line its saves wait in, shared by every draft of one Session (`saveLine`). */
  line?: SaveLine
}

/**
 * Saves that go one at a time, in order: a Session's drafts share one, since the server takes one
 * edit to a Session at a time and refuses another meanwhile.
 */
export function saveLine() {
  let tail: Promise<unknown> = Promise.resolve()
  return <R>(work: () => Promise<R>): Promise<R> => {
    const next = tail.then(work)
    tail = next.catch(() => {})
    return next
  }
}
export type SaveLine = ReturnType<typeof saveLine>

export type AutosaveStatus =
  | { kind: 'idle' | 'unsaved' | 'saving' | 'saved' }
  | { kind: 'refused'; why: string }

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))

/**
 * A draft edited by hand that saves itself when it's left (`onFocusout` on the panel holding it)
 * and whenever `flush` is called: before work that reads it (a render, an Action), on a discrete
 * change (a person removed), on leaving the screen. One save at a time, in order. A draft that
 * can't be saved yet, or that the server refused, stays as typed, saying why, until it changes.
 * `revert` saves back what was there when this thing was opened, or last changed by something
 * else (an Action, another tab).
 */
export function useAutosave<T>(opts: AutosaveOptions<T>) {
  const normal = opts.normal ?? ((v: T) => v)
  const json = (v: T | null) => JSON.stringify(v === null ? null : normal(v))
  const same = (a: T | null, b: T | null) => json(a) === json(b)
  const copyOf = (v: T | null) => (v === null ? null : copy(v))

  const draft = ref(null) as Ref<T | null>
  /** What's saved, as last seen. */
  const base = ref(null) as Ref<T | null>
  /** What Revert goes back to. */
  const opened = ref(null) as Ref<T | null>
  let draftKey: unknown
  /** Saves on their way, and the draft the latest of them sent. */
  const saving = ref(0)
  let sent: T | null = null
  const savedOnce = ref(false)
  /** Why a draft wasn't saved: this one as it was then, or another thing's (`elsewhere`). */
  const refused = ref<{ why: string; draft?: string } | null>(null)
  const line = opts.line ?? saveLine()

  const dirty = computed(() => draft.value !== null && !same(draft.value, base.value))

  function start(value: T | null) {
    draft.value = copyOf(value)
    base.value = copyOf(value)
    opened.value = copyOf(value)
    savedOnce.value = false
    if (refused.value?.draft !== undefined) refused.value = null
  }

  async function send(snapshot: T, key: unknown): Promise<boolean> {
    const here = key === draftKey
    if (here && same(snapshot, base.value)) return true // saved meanwhile
    const held = opts.hold?.(snapshot)
    if (held) return refuse(held, snapshot, here, key)
    sent = snapshot
    saving.value++
    try {
      const saved = await opts.save(snapshot, key)
      if (key === draftKey) {
        if (same(draft.value, snapshot)) draft.value = copy(saved)
        base.value = copy(saved)
        savedOnce.value = true
      }
      refused.value = null
      return true
    } catch (err) {
      return refuse((err as Error).message, snapshot, key === draftKey, key)
    } finally {
      saving.value--
    }
  }

  function refuse(why: string, snapshot: T, here: boolean, key: unknown): false {
    refused.value = here
      ? { why, draft: json(snapshot) }
      : { why: opts.name ? `${opts.name(key)}: ${why}` : why }
    return false
  }

  /**
   * Saves the draft if it changed, after the saves already in line; false if it's left unsaved
   * (held back, or refused).
   */
  function flush(): Promise<boolean> {
    if (dirty.value) {
      const [snapshot, key] = [copy(draft.value!), draftKey]
      line(() => send(snapshot, key))
    }
    return line(async () => !dirty.value)
  }

  watch(
    () => [json(opts.source()), opts.key?.()] as const,
    ([, key], old) => {
      const value = opts.source()
      if (!old || key !== old[1]) {
        // Something else to edit: the old draft goes to the old one first.
        if (old) flush()
        draftKey = key
        return start(value)
      }
      // Saved by us (as the server tidied it), or changed elsewhere.
      const ours = saving.value > 0
      if (!dirty.value || (ours && same(draft.value, sent))) draft.value = copyOf(value)
      base.value = copyOf(value)
      if (!ours) opened.value = copyOf(value)
    },
    { immediate: true },
  )

  /** Back to what was there when opened: put in the draft, and saved. */
  function revert(): Promise<boolean> {
    draft.value = copyOf(opened.value)
    return flush()
  }

  /** On the panel holding the draft: saves once the focus leaves it. */
  function onFocusout(e: FocusEvent) {
    const panel = e.currentTarget as HTMLElement
    if (e.relatedTarget instanceof Node && panel.contains(e.relatedTarget)) return
    flush()
  }

  const status = computed<AutosaveStatus>(() => {
    if (saving.value) return { kind: 'saving' }
    const r = refused.value
    if (r && (r.draft === undefined || r.draft === json(draft.value))) {
      return { kind: 'refused', why: r.why }
    }
    if (dirty.value) return { kind: 'unsaved' }
    return { kind: savedOnce.value ? 'saved' : 'idle' }
  })
  const canRevert = computed(() => opened.value !== null && !same(draft.value, opened.value))

  if (getCurrentInstance()) {
    // Leaving the screen saves; reloading or closing it asks first, while something's unsaved.
    onDeactivated(flush)
    tryOnBeforeUnmount(flush)
    useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
      if (dirty.value || saving.value) {
        e.preventDefault()
        e.returnValue = ''
      }
    })
  }

  return { draft, dirty, status, canRevert, flush, revert, onFocusout }
}
