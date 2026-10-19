import { useRafFn } from '@vueuse/core'
import { type Ref, ref } from 'vue'

export interface DragReorderOptions {
  /** What scrolls, holding the items. */
  scroller: Readonly<Ref<HTMLElement | null>>
  /** Finds the items in `scroller`, in their order as shown. */
  items: string
  /** Which way the items run: across (`x`) or down (`y`). */
  axis: 'x' | 'y'
  /** Moves the item at `from` to `to`, as the pointer passes over another. */
  move: (from: number, to: number) => void
  /** The drag is over: the item is let go. */
  end?: () => void
}

/**
 * Moving the items of a list by dragging a grip: the item follows the pointer over the others,
 * and the list scrolls while the pointer is near its edge. Pointer events rather than HTML drag
 * and drop, which phones don't all do; only the grip takes the touch, so a swipe still scrolls.
 * `dragging` is where the dragged item is now. Spread `grip(index)` onto the grip's `v-on`.
 */
export function useDragReorder(opts: DragReorderOptions) {
  const dragging = ref<number | null>(null)
  let pointer = 0
  /** Where the drag started: the list only scrolls once it's moved, not for a grip by an edge. */
  let start = 0
  const along = (e: PointerEvent) => (opts.axis === 'x' ? e.clientX : e.clientY)
  const span = (el: Element) => {
    const r = el.getBoundingClientRect()
    return opts.axis === 'x' ? [r.left, r.right] : [r.top, r.bottom]
  }

  function dragTo(at: number) {
    pointer = at
    const el = opts.scroller.value
    if (dragging.value === null || !el) return
    const over = [...el.querySelectorAll(opts.items)].findIndex((item) => {
      const [from, to] = span(item)
      return at >= from && at < to
    })
    if (over < 0 || over === dragging.value) return
    opts.move(dragging.value, over)
    dragging.value = over
  }
  const edgeScroll = useRafFn(() => {
    const el = opts.scroller.value
    if (!el || Math.abs(pointer - start) < 8) return
    const [from, to] = span(el)
    const edge = 48
    const by = pointer < from + edge ? -12 : pointer > to - edge ? 12 : 0
    if (!by) return
    if (opts.axis === 'x') el.scrollLeft += by
    else el.scrollTop += by
    dragTo(pointer)
  }, { immediate: false })

  function end() {
    if (dragging.value === null) return
    dragging.value = null
    edgeScroll.pause()
    opts.end?.()
  }

  const grip = (index: number) => ({
    pointerdown(e: PointerEvent) {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      dragging.value = index
      pointer = start = along(e)
      edgeScroll.resume()
    },
    pointermove: (e: PointerEvent) => dragTo(along(e)),
    pointerup: end,
    pointercancel: end,
  })

  return { dragging, grip }
}
