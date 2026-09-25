import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { usePinchZoom } from './usePinchZoom'

/** A 400×300 frame at the page's origin. */
function mountFrame() {
  let zoom!: ReturnType<typeof usePinchZoom>
  const wrapper = mount(
    defineComponent(() => {
      const frame = ref<HTMLElement | null>(null)
      zoom = usePinchZoom(frame)
      return () => h('div', { ref: frame }, [h('button', 'Back')])
    }),
    { attachTo: document.body },
  )
  const el = wrapper.element as HTMLElement
  Object.defineProperty(el, 'clientWidth', { value: 400 })
  Object.defineProperty(el, 'clientHeight', { value: 300 })
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 }) as DOMRect
  return { el, zoom: () => zoom, wrapper }
}

/** A wheel event; happy-dom drops `ctrlKey` and the pointer position, so they're set by hand. */
function wheel(
  el: HTMLElement,
  init: { deltaX?: number; deltaY?: number; ctrlKey?: boolean; x?: number; y?: number },
) {
  const e = new WheelEvent('wheel', {
    deltaX: init.deltaX ?? 0,
    deltaY: init.deltaY ?? 0,
    cancelable: true,
  })
  for (
    const [key, value] of [['ctrlKey', !!init.ctrlKey], ['clientX', init.x ?? 0], [
      'clientY',
      init.y ?? 0,
    ]] as const
  ) {
    Object.defineProperty(e, key, { value })
  }
  el.dispatchEvent(e)
  return e
}

/** A trackpad pinch: a wheel event with `ctrlKey`, as Chrome and Firefox send it. */
const pinch = (el: HTMLElement, deltaY: number, x = 200, y = 150) =>
  wheel(el, { deltaY, ctrlKey: true, x, y })

describe('usePinchZoom', () => {
  it('zooms on a trackpad pinch instead of the page, around the pointer', () => {
    const { el, zoom } = mountFrame()
    const e = pinch(el, -100 * Math.log(2)) // exp(0.01 × 69.3…) = 2×
    expect(e.defaultPrevented).toBe(true)
    const { scale, x, y } = zoom().view.value
    expect(scale).toBeCloseTo(2)
    // The centre stays under the pointer: 200 - (200 - 0) × 2.
    expect([x, y].map((n) => Math.round(n))).toEqual([-200, -150])
  })

  it('never zooms out below 1× or in past 8×, and lets ordinary scrolling through when not zoomed', () => {
    const { el, zoom } = mountFrame()
    pinch(el, 500)
    expect(zoom().view.value.scale).toBe(1)
    expect(wheel(el, { deltaY: 40 }).defaultPrevented).toBe(false)
    pinch(el, -5000)
    expect(zoom().view.value.scale).toBe(8)
  })

  it('pans with two-finger scrolling while zoomed, without leaving a gap at the edges', () => {
    const { el, zoom } = mountFrame()
    pinch(el, -100 * Math.log(2), 0, 0) // 2× anchored at the top-left
    wheel(el, { deltaX: 50, deltaY: 1000 })
    expect(zoom().view.value).toMatchObject({ x: -50, y: -300 })
  })

  it('resets on double-click', () => {
    const { el, zoom } = mountFrame()
    pinch(el, -100)
    el.dispatchEvent(new MouseEvent('dblclick'))
    expect(zoom().view.value).toEqual({ scale: 1, x: 0, y: 0 })
  })
})
