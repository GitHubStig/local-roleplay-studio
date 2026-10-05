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
 * Pinch-to-zoom on `frame` instead of zooming the whole page. A trackpad pinch arrives as a
 * `wheel` event with `ctrlKey` set (Chrome, Firefox) or as `gesture*` events (Safari); both are
 * cancelled so the page stays put. While zoomed in, two-finger scrolling or dragging pans, and the
 * image always covers the frame. Returns the transform for the zoomed layer.
 */
export function usePinchZoom(frame: Readonly<Ref<HTMLElement | null>>) {
  /** Scale, and the layer's offset in px from the frame's top-left corner. */
  const view = ref({ scale: 1, x: 0, y: 0 })
  const zoomed = computed(() => view.value.scale > 1)

  /** Keeps the scaled layer covering the frame: no gaps at the edges. */
  function set(scale: number, x: number, y: number) {
    const el = frame.value
    const s = Math.min(MAX_SCALE, Math.max(1, scale))
    const w = el?.clientWidth ?? 0
    const h = el?.clientHeight ?? 0
    view.value = {
      scale: s,
      x: Math.min(0, Math.max(w * (1 - s), x)),
      y: Math.min(0, Math.max(h * (1 - s), y)),
    }
  }

  /** Zooms to `scale`, keeping the point under the pointer where it is. */
  function zoomAt(scale: number, clientX: number, clientY: number) {
    const rect = frame.value!.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top
    const { scale: s, x, y } = view.value
    const next = Math.min(MAX_SCALE, Math.max(1, scale))
    set(next, px - (px - x) * (next / s), py - (py - y) * (next / s))
  }

  const reset = () => (view.value = { scale: 1, x: 0, y: 0 })

  function onWheel(e: WheelEvent) {
    if (e.ctrlKey) {
      e.preventDefault()
      zoomAt(view.value.scale * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY)
    } else if (zoomed.value) {
      e.preventDefault()
      set(view.value.scale, view.value.x - e.deltaX, view.value.y - e.deltaY)
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
    set(view.value.scale, view.value.x + e.clientX - drag.x, view.value.y + e.clientY - drag.y)
    drag = { ...drag, x: e.clientX, y: e.clientY }
  }
  const onPointerUp = () => (drag = null)

  // Not Vue's listeners: those can't be made non-passive, and a passive one can't cancel the page
  // zoom.
  const cancellable = { passive: false }
  useEventListener(frame, 'wheel', onWheel, cancellable)
  useEventListener(frame, 'gesturestart', onGestureStart, cancellable)
  useEventListener(frame, 'gesturechange', onGestureChange, cancellable)
  useEventListener(frame, 'gestureend', (e: Event) => e.preventDefault(), cancellable)
  useEventListener(frame, 'pointerdown', onPointerDown)
  useEventListener(frame, 'pointermove', onPointerMove)
  useEventListener(frame, ['pointerup', 'pointercancel'], onPointerUp)
  useEventListener(frame, 'dblclick', reset)

  const layerStyle = computed(() =>
    zoomed.value
      ? { transform: `translate(${view.value.x}px, ${view.value.y}px) scale(${view.value.scale})` }
      : {}
  )

  return { view, zoomed, layerStyle, reset }
}
