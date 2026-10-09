import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Preview, useShownPreview } from './useShownPreview'

/** An Image that loads at once, unless its address says it's missing. */
class FakeImage {
  onload: (() => void) | null = null
  set src(src: string) {
    if (!src.includes('missing')) queueMicrotask(() => this.onload?.())
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('Image', FakeImage)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const flush = async () => {
  await nextTick()
  await Promise.resolve()
}

describe('useShownPreview', () => {
  it('shows each preview once loaded, and keeps the last when one fails', async () => {
    const preview = ref<Preview | null>(null)
    const shown = useShownPreview(() => preview.value, () => 'old.png')
    preview.value = { src: 'p?step=1', opacity: 0.1 }
    await flush()
    expect(shown.value).toEqual({ src: 'p?step=1', opacity: 0.1 })
    preview.value = { src: 'missing?step=2', opacity: 0.2 }
    await flush()
    expect(shown.value?.src).toBe('p?step=1')
  })

  it('stays when the render ends until the new picture is in', async () => {
    const preview = ref<Preview | null>({ src: 'p?step=1', opacity: 0.5 })
    const image = ref('old.png')
    const shown = useShownPreview(() => preview.value, () => image.value)
    await flush()
    preview.value = null
    await flush()
    expect(shown.value).not.toBeNull()
    image.value = 'new.png'
    await flush()
    expect(shown.value).toBeNull()
  })

  it('goes after a while when no new picture comes (a Cancel)', async () => {
    const preview = ref<Preview | null>({ src: 'p?step=1', opacity: 0.5 })
    const shown = useShownPreview(() => preview.value, () => 'old.png')
    await flush()
    preview.value = null
    await flush()
    vi.advanceTimersByTime(1500)
    expect(shown.value).toBeNull()
  })
})
