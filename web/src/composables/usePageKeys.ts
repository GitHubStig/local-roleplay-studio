import { useEventListener } from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

/**
 * Page Up and Down, Home and End scroll `area` wherever the focus is. The browser scrolls only the
 * box holding the focus, so a scrolling box under a header kept the keys from doing anything while
 * the focus was on the header's buttons (where a dialog puts it on opening) or on nothing (a page
 * just loaded). Left to the browser when the focus is already in `area`, and skipped in a text
 * field, in a dialog `area` isn't in (one opened over it), or while `paused`.
 */
export function usePageKeys(
  area: MaybeRefOrGetter<HTMLElement | null | undefined>,
  paused: MaybeRefOrGetter<boolean> = false,
) {
  useEventListener(document, 'keydown', (e: KeyboardEvent) => {
    const el = toValue(area)
    const target = e.target as HTMLElement
    if (!el || toValue(paused) || e.defaultPrevented) return
    if (e.altKey || e.ctrlKey || e.metaKey || el.contains(target)) return
    if (target.isContentEditable || target.closest('input, textarea, select')) return
    if (target.closest('dialog') !== el.closest('dialog')) return
    const page = el.clientHeight * 0.875
    const top = ({
      PageUp: el.scrollTop - page,
      PageDown: el.scrollTop + page,
      Home: 0,
      End: el.scrollHeight,
    } as Record<string, number>)[e.key]
    if (top === undefined) return
    e.preventDefault()
    el.scrollTo({ top, behavior: 'smooth' })
  })
}
