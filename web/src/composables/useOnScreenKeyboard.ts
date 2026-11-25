import { useActiveElement, useEventListener } from '@vueuse/core'
import { computed, shallowRef } from 'vue'

/** Less than this between the page's height and what's seen of it is a browser's bar, not a keyboard. */
const KEYBOARD_AT_LEAST = 120

/**
 * The on-screen keyboard, while it's up: the part of the page above it (`visible`, its height and
 * how far down the page it starts), or null.
 *
 * A phone's browser lays the page out as if the keyboard weren't there (iOS Safari always does):
 * only the visual viewport shrinks, and the browser scrolls the page to the caret, so a screen
 * sized to the window (`h-dvh`) keeps its bottom, the text box, behind the keyboard. Pinned to
 * `visible` instead, the screen ends where the keyboard starts. It's up when a text field has
 * focus and what's seen is much shorter than the page.
 */
export function useOnScreenKeyboard() {
  const viewport = globalThis.visualViewport ?? undefined
  const seen = shallowRef({ height: 0, top: 0 })
  function measure() {
    if (viewport) seen.value = { height: viewport.height, top: viewport.offsetTop }
  }
  measure()
  useEventListener(viewport, 'resize', measure)
  useEventListener(viewport, 'scroll', measure)

  const active = useActiveElement()
  const typing = computed(() => {
    const el = active.value
    return !!el && (el instanceof HTMLTextAreaElement || el.isContentEditable ||
      (el instanceof HTMLInputElement &&
        !['checkbox', 'radio', 'range', 'button', 'submit', 'file', 'color'].includes(el.type)))
  })

  const visible = computed(() => {
    if (!viewport || !typing.value) return null
    const page = document.documentElement.clientHeight
    return page - seen.value.height >= KEYBOARD_AT_LEAST ? seen.value : null
  })
  return { visible }
}
