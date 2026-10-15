import { effectScope, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePageKeys } from './usePageKeys'

const scope = effectScope()
afterEach(() => {
  scope.stop()
  document.body.innerHTML = ''
})

/** A header with a button, over a scrolling box 400 px high, scrolled to 1000. */
function page(paused = ref(false)) {
  document.body.innerHTML =
    '<div><button>Export</button><input></div><div data-area><button>grip</button></div>'
  const area = document.querySelector<HTMLElement>('[data-area]')!
  Object.defineProperty(area, 'clientHeight', { value: 400 })
  Object.defineProperty(area, 'scrollHeight', { value: 5000 })
  area.scrollTop = 1000
  area.scrollTo = vi.fn() as typeof area.scrollTo
  scope.run(() => usePageKeys(area, paused))
  return area
}
const press = (key: string, on: Element = document.body) =>
  on.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
const tops = (area: HTMLElement) =>
  vi.mocked(area.scrollTo).mock.calls.map(([o]) => (o as ScrollToOptions).top)

describe('usePageKeys', () => {
  it('scrolls the box by a page, or to its ends, with the focus outside it', () => {
    const area = page()
    const header = document.querySelector('button')!
    for (const key of ['PageDown', 'PageUp', 'Home', 'End']) {
      expect(press(key, header)).toBe(false)
    }
    expect(tops(area)).toEqual([1350, 650, 0, 5000])
  })

  it('leaves other keys, text fields, the box itself and a paused one to the browser', () => {
    const paused = ref(false)
    const area = page(paused)
    expect(press('ArrowDown')).toBe(true)
    expect(press('PageDown', document.querySelector('input')!)).toBe(true)
    expect(press('PageDown', area.querySelector('button')!)).toBe(true)
    paused.value = true
    expect(press('PageDown')).toBe(true)
    expect(area.scrollTo).not.toHaveBeenCalled()
  })

  it('leaves a dialog opened over the box alone', () => {
    const area = page()
    document.body.insertAdjacentHTML('beforeend', '<dialog open><button>OK</button></dialog>')
    expect(press('PageDown', document.querySelector('dialog button')!)).toBe(true)
    expect(area.scrollTo).not.toHaveBeenCalled()
  })
})
