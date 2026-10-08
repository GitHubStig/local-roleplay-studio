import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { usePinchZoom } from './usePinchZoom'

/** A 400×300 frame at the page's origin, its listeners attached (a tick after mounting). */
async function mountFrame() {
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
  await nextTick()
  return { el, zoom: () => zoom, wrapper }
}

/** A wheel event; happy-dom drops `ctrlKey` and the pointer position, so they're set by hand. */
function wheel(
  el: HTMLElement,
  init: {
    deltaX?: number
    deltaY?: number
    deltaMode?: number
    ctrlKey?: boolean
    x?: number
    y?: number
  },
) {
  const e = new WheelEvent('wheel', {
    deltaX: init.deltaX ?? 0,
    deltaY: init.deltaY ?? 0,
    deltaMode: init.deltaMode ?? 0,
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
  it('zooms on a trackpad pinch instead of the page, around the pointer', async () => {
    const { el, zoom } = await mountFrame()
    const e = pinch(el, -100 * Math.log(2)) // exp(0.01 × 69.3…) = 2×
    expect(e.defaultPrevented).toBe(true)
    const { scale, x, y } = zoom().view.value
    expect(scale).toBeCloseTo(2)
    // The centre stays under the pointer: 200 - (200 - 0) × 2.
    expect([x, y].map((n) => Math.round(n))).toEqual([-200, -150])
  })

  it('never zooms out below 1× or in past 8×, and lets ordinary scrolling through when not zoomed', async () => {
    const { el, zoom } = await mountFrame()
    pinch(el, 500)
    expect(zoom().view.value.scale).toBe(1)
    expect(wheel(el, { deltaY: 40 }).defaultPrevented).toBe(false)
    pinch(el, -5000)
    expect(zoom().view.value.scale).toBe(8)
  })

  it('pans with two-finger scrolling while zoomed, without leaving a gap at the edges', async () => {
    const { el, zoom } = await mountFrame()
    pinch(el, -100 * Math.log(2), 0, 0) // 2× anchored at the top-left
    wheel(el, { deltaX: 50, deltaY: 1000 })
    expect(zoom().view.value).toMatchObject({ x: -50, y: -300 })
  })

  it('zooms a step a notch on a mouse wheel, around the pointer, which Windows needs (no pinch)', async () => {
    const { el, zoom } = await mountFrame()
    // Edge and Chrome: 100 px a notch; up zooms in.
    const e = wheel(el, { deltaY: -100, x: 200, y: 150 })
    expect(e.defaultPrevented).toBe(true)
    expect(zoom().view.value.scale).toBeCloseTo(1.25)
    // Firefox: 3 lines a notch; two notches back down.
    wheel(el, { deltaY: 6, deltaMode: WheelEvent.DOM_DELTA_LINE, x: 200, y: 150 })
    expect(zoom().view.value.scale).toBe(1)
    // Ctrl with a mouse wheel: the same step, not the pinch's.
    wheel(el, { deltaY: -100, ctrlKey: true, x: 200, y: 150 })
    expect(zoom().view.value.scale).toBeCloseTo(1.25)
  })

  it('zooms with a mouse wheel on a page zoomed in or out, not only at 100%', async () => {
    const { el, zoom } = await mountFrame()
    const ratio = globalThis.devicePixelRatio
    try {
      // Edge at 110% (as measured): 90.909… px a notch, the page's pixels, not the screen's.
      globalThis.devicePixelRatio = 1.1
      const e = wheel(el, { deltaY: -90.90908893868948, x: 200, y: 150 })
      expect(e.defaultPrevented).toBe(true)
      expect(zoom().view.value.scale).toBeCloseTo(1.25)
      // At 150%: 66.67 px a notch.
      globalThis.devicePixelRatio = 1.5
      wheel(el, { deltaY: 66.66666666666667, x: 200, y: 150 })
      expect(zoom().view.value.scale).toBe(1)
      // A trackpad's scroll on that page still pans, not zooms.
      expect(wheel(el, { deltaY: 3.7 }).defaultPrevented).toBe(false)
    } finally {
      globalThis.devicePixelRatio = ratio
    }
  })

  it("keeps a trackpad's scrolling for panning: small, fractional or sideways deltas", async () => {
    const { el, zoom } = await mountFrame()
    expect(wheel(el, { deltaY: 3.5 }).defaultPrevented).toBe(false)
    expect(wheel(el, { deltaX: 2, deltaY: 120 }).defaultPrevented).toBe(false)
    expect(zoom().view.value.scale).toBe(1)
  })

  it("doesn't take the end of a trackpad flick for a mouse wheel's notch", async () => {
    const { el, zoom } = await mountFrame()
    // A fast flick: small deltas, then a large whole one, all in one scroll.
    wheel(el, { deltaY: 4.5 })
    expect(wheel(el, { deltaY: 100 }).defaultPrevented).toBe(false)
    expect(zoom().view.value.scale).toBe(1)
    // A mouse wheel, a moment later, zooms as ever.
    await new Promise((r) => setTimeout(r, 350))
    wheel(el, { deltaY: -100 })
    expect(zoom().view.value.scale).toBeCloseTo(1.25)
  })

  it('resets on double-click', async () => {
    const { el, zoom } = await mountFrame()
    pinch(el, -100)
    el.dispatchEvent(new MouseEvent('dblclick'))
    expect(zoom().view.value).toEqual({ scale: 1, x: 0, y: 0 })
  })
})
