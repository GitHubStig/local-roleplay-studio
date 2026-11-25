import { effectScope, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOnScreenKeyboard } from './useOnScreenKeyboard'

/** A stand-in visual viewport, which happy-dom doesn't have: what's seen of an 874 px page. */
function stubViewport() {
  const viewport = Object.assign(new EventTarget(), { height: 874, offsetTop: 0 })
  vi.stubGlobal('visualViewport', viewport)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(874)
  return viewport
}
function keyboard(viewport: ReturnType<typeof stubViewport>, height: number, offsetTop = 0) {
  Object.assign(viewport, { height, offsetTop })
  viewport.dispatchEvent(new Event('resize'))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('useOnScreenKeyboard', () => {
  it('is up only while a text box has focus and what is seen is much shorter than the page', async () => {
    const viewport = stubViewport()
    const box = document.body.appendChild(document.createElement('textarea'))
    const { visible } = effectScope().run(() => useOnScreenKeyboard())!

    keyboard(viewport, 420, 30)
    await nextTick()
    expect(visible.value).toBeNull() // nothing typed into

    box.focus()
    await nextTick()
    expect(visible.value).toEqual({ height: 420, top: 30 })

    keyboard(viewport, 800) // a browser's bar, not a keyboard
    await nextTick()
    expect(visible.value).toBeNull()

    keyboard(viewport, 420)
    box.blur()
    await nextTick()
    expect(visible.value).toBeNull()
  })

  it('leaves a tick box alone', async () => {
    const viewport = stubViewport()
    const tick = document.body.appendChild(
      Object.assign(document.createElement('input'), { type: 'checkbox' }),
    )
    const { visible } = effectScope().run(() => useOnScreenKeyboard())!
    tick.focus()
    keyboard(viewport, 420)
    await nextTick()
    expect(visible.value).toBeNull()
  })
})
