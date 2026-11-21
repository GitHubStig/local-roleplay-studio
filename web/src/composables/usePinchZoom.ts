import { useEventListener } from '@vueuse/core'
import { computed, type Ref, ref } from 'vue'

/** Safari's trackpad pinch event (not in TypeScript's DOM types). */
interface GestureEvent extends UIEvent {
  scale: number
  clientX: number
  clientY: number
}

const MAX_SCALE = 8

/**
 * A zoom: its scale, and the zoomed layer's offset from the frame's top-left corner, as a share of
 * the frame's width and height, so frames of slightly different sizes can share one.
 */
export interface ZoomView {
  scale: number
  x: number
  y: number
}
/** Not zoomed. */
export const unzoomed = (): ZoomView => ({ scale: 1, x: 0, y: 0 })
/** How much one notch of a mouse wheel zooms. */
const WHEEL_STEP = 1.25

/**
 * A mouse wheel's notch rather than a trackpad's scroll, which pans: Firefox counts a wheel in
 * lines; Chrome and Edge in pixels, 100 a notch, straight up or down. A trackpad sends small,
 * fractional, often diagonal pixel deltas. Chrome and Edge divide the pixels by the page's zoom
 * (90.909… a notch at 110%, 66.67 at 150%), so they're taken back to screen pixels first, or a
 * zoomed page's wheel would pan like a trackpad. Returns the notches, or 0 for a trackpad.
 */
function wheelNotches(e: WheelEvent): number {
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return e.deltaY / 3
  if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return e.deltaY
  const px = e.deltaY * (globalThis.devicePixelRatio || 1)
  const whole = Math.abs(px - Math.round(px)) < 0.01
  const notch = e.deltaX === 0 && whole && Math.abs(px) >= 50
  return notch ? Math.round(px) / 100 : 0
}

/**
 * Zoom on `frame` instead of zooming the whole page: a trackpad pinch, which arrives as a `wheel`
 * event with `ctrlKey` set (Chrome, Firefox) or as `gesture*` events (Safari), or a mouse wheel
 * (Windows has no pinch on a mouse); all are cancelled so the page stays put. While zoomed in,
 * two-finger scrolling or dragging pans, and the image always covers the frame. Returns the
 * transform for the zoomed layer. Frames given the same `view` zoom and pan together.
 */
export function usePinchZoom(
  frame: Readonly<Ref<HTMLElement | null>>,
  view: Ref<ZoomView> = ref(unzoomed()),
) {
  const zoomed = computed(() => view.value.scale > 1)

  /** The frame's size in px. */
  const sizeOf = () => ({ w: frame.value?.clientWidth ?? 0, h: frame.value?.clientHeight ?? 0 })
  /** The layer's offset in px. */
  const offset = () => {
    const { w, h } = sizeOf()
    return { x: view.value.x * w, y: view.value.y * h }
  }

  /** Sets the zoom from an offset in px, keeping the scaled layer covering the frame: no gaps. */
  function set(scale: number, x: number, y: number) {
    const { w, h } = sizeOf()
    const s = Math.min(MAX_SCALE, Math.max(1, scale))
    view.value = {
      scale: s,
      x: w ? Math.min(0, Math.max(w * (1 - s), x)) / w : 0,
      y: h ? Math.min(0, Math.max(h * (1 - s), y)) / h : 0,
    }
  }

  /** Zooms to `scale`, keeping the point under the pointer where it is. */
  function zoomAt(scale: number, clientX: number, clientY: number) {
    const rect = frame.value!.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top
    const s = view.value.scale
    const { x, y } = offset()
    const next = Math.min(MAX_SCALE, Math.max(1, scale))
    set(next, px - (px - x) * (next / s), py - (py - y) * (next / s))
  }

  const reset = () => (view.value = unzoomed())

  /**
   * When a wheel event last looked like a touchpad's. Its scroll's later events follow it for a
   * moment: a fast flick can end in large whole deltas that look like a mouse's notches, and would
   * jump from panning to zooming.
   */
  let touchpadAt = -Infinity
  const TOUCHPAD_MS = 300

  function onWheel(e: WheelEvent) {
    // A mouse wheel zooms a step a notch, with Ctrl or without; a touchpad pinch zooms as the
    // fingers move, and its two-finger scrolling pans.
    let notches = wheelNotches(e)
    if (!notches) touchpadAt = e.timeStamp
    else if (e.timeStamp - touchpadAt < TOUCHPAD_MS) notches = 0
    if (notches) {
      e.preventDefault()
      zoomAt(view.value.scale * WHEEL_STEP ** -notches, e.clientX, e.clientY)
    } else if (e.ctrlKey) {
      e.preventDefault()
      zoomAt(view.value.scale * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY)
    } else if (zoomed.value) {
      e.preventDefault()
      const { x, y } = offset()
      set(view.value.scale, x - e.deltaX, y - e.deltaY)
    }
  }

  let gestureStart = 1
  function onGestureStart(e: Event) {
    e.preventDefault()
    gestureStart = view.value.scale
  }
  function onGestureChange(e: Event) {
    e.preventDefault()
    const g = e as GestureEvent
    zoomAt(gestureStart * g.scale, g.clientX, g.clientY)
  }

  let drag: { id: number; x: number; y: number } | null = null
  function onPointerDown(e: PointerEvent) {
    if (!zoomed.value || e.button !== 0) return
    // Controls drawn over the image keep their clicks.
    if ((e.target as Element).closest?.('button, a, input, textarea, select')) return
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
    frame.value?.setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: PointerEvent) {
    if (drag?.id !== e.pointerId) return
    const { x, y } = offset()
    set(view.value.scale, x + e.clientX - drag.x, y + e.clientY - drag.y)
    drag = { ...drag, x: e.clientX, y: e.clientY }
  }
  const onPointerUp = () => (drag = null)

  /**
   * Only what happens in the frame's own dialog: one opened over it from inside it (Compare edits
   * in the viewer's picture) is inside it in the page, and its pinches, drags and double-clicks
   * bubbling out zoomed the picture behind, which then took the pointer, so the double-click that
   * should reset the one in front reset the one behind (2026-11-21).
   */
  const own = <E extends Event>(handle: (e: E) => void) => (e: E) => {
    const target = e.target as Element | null
    if (target?.closest?.('dialog') === (frame.value?.closest('dialog') ?? null)) handle(e)
  }

  // Not Vue's listeners: those can't be made non-passive, and a passive one can't cancel the page
  // zoom.
  const cancellable = { passive: false }
  useEventListener(frame, 'wheel', own(onWheel), cancellable)
  useEventListener(frame, 'gesturestart', own(onGestureStart), cancellable)
  useEventListener(frame, 'gesturechange', own(onGestureChange), cancellable)
  useEventListener(frame, 'gestureend', own((e: Event) => e.preventDefault()), cancellable)
  useEventListener(frame, 'pointerdown', own(onPointerDown))
  useEventListener(frame, 'pointermove', onPointerMove)
  useEventListener(frame, ['pointerup', 'pointercancel'], onPointerUp)
  useEventListener(frame, 'dblclick', own(reset))

  const layerStyle = computed(() =>
    zoomed.value
      ? {
        transform: `translate(${view.value.x * 100}%, ${
          view.value.y * 100
        }%) scale(${view.value.scale})`,
      }
      : {}
  )

  return { view, zoomed, layerStyle, reset }
}
