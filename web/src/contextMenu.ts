/** Where a menu opens: the pointer's place on the screen. */
export interface MenuAt {
  x: number
  y: number
}

/** How long a finger rests on something before its menu opens, and how far it may drift meanwhile. */
const HOLD_MS = 500
const DRIFT_PX = 10

/**
 * Makes the listeners (for `v-on`) that open something's menu: a right-click, or on a touch screen
 * a long press, which Safari doesn't turn into a right-click. A long press doesn't also click what
 * was pressed, and a finger that moves (scrolling the strip) opens nothing. The element should
 * also have `[-webkit-touch-callout:none]`, so Safari's own menu for an image stays away. The press
 * is kept here, not in the listeners, as a template makes them again at each render, which may
 * come mid-press.
 */
export function contextMenus() {
  let timer: ReturnType<typeof setTimeout> | undefined
  let start: MenuAt | null = null
  let held = false
  const cancel = () => {
    clearTimeout(timer)
    start = null
  }
  return (open: (at: MenuAt) => void) => ({
    contextmenu(e: MouseEvent) {
      e.preventDefault()
      cancel()
      open({ x: e.clientX, y: e.clientY })
    },
    pointerdown(e: PointerEvent) {
      held = false
      cancel()
      if (e.pointerType !== 'touch') return
      const at = { x: e.clientX, y: e.clientY }
      start = at
      timer = setTimeout(() => {
        held = true
        start = null
        open(at)
      }, HOLD_MS)
    },
    pointermove(e: PointerEvent) {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRIFT_PX) cancel()
    },
    pointerup: cancel,
    pointercancel: cancel,
    // Before the element's own click, which a long press shouldn't make.
    clickCapture(e: MouseEvent) {
      if (!held) return
      held = false
      e.preventDefault()
      e.stopImmediatePropagation()
    },
  })
}
