import type { Directive } from 'vue'

/** Makes a textarea exactly as tall as its text, so it never scrolls on its own. */
function fit(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

const observers = new WeakMap<HTMLTextAreaElement, ResizeObserver>()

/**
 * `v-autosize`: the textarea grows and shrinks with its text (as it's typed, when its value
 * changes, and when its width changes the wrapping), so a page of them scrolls as one page instead
 * of trapping the scroll wheel in each box.
 */
export const vAutosize: Directive<HTMLTextAreaElement> = {
  mounted(el) {
    el.style.overflowY = 'hidden'
    el.addEventListener('input', () => fit(el))
    if (typeof ResizeObserver !== 'undefined') {
      let width = el.clientWidth
      const observer = new ResizeObserver(() => {
        if (el.clientWidth === width) return
        width = el.clientWidth
        fit(el)
      })
      observer.observe(el)
      observers.set(el, observer)
    }
    fit(el)
  },
  updated: fit,
  unmounted(el) {
    observers.get(el)?.disconnect()
  },
}
