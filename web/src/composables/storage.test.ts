import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('useStoredString', () => {
  it('saves at once, even two changes in the same tick', async () => {
    const { useStoredString } = await import('./storage')
    const draft = useStoredString('draft:r1')
    draft.value = ''
    draft.value = 'Thanks.'
    expect(localStorage.getItem('draft:r1')).toBe('Thanks.')
    draft.value = null
    expect(localStorage.getItem('draft:r1')).toBeNull()
  })

  it("isn't changed by another tab writing the same key", async () => {
    const { useStoredString } = await import('./storage')
    const draft = useStoredString('draft:r1')
    draft.value = 'Mine.'
    localStorage.setItem('draft:r1', 'Theirs.')
    window.dispatchEvent(new StorageEvent('storage', { key: 'draft:r1', newValue: 'Theirs.' }))
    await nextTick()
    expect(draft.value).toBe('Mine.')
  })

  it('still works, for this visit only, when the browser blocks storage', async () => {
    vi.stubGlobal('localStorage', undefined)
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      },
    })
    try {
      const { useStoredFlag } = await import('./useStoredFlag')
      const { useCurrentSession, setCurrentSession } = await import('./useCurrentSession')
      const flag = useStoredFlag('caption-hidden')
      flag.value = true
      expect(flag.value).toBe(true)
      setCurrentSession('s1', 'roleplay')
      expect(useCurrentSession().currentSessionKind.value).toBe('roleplay')
    } finally {
      delete (window as { localStorage?: unknown }).localStorage
    }
  })
})
