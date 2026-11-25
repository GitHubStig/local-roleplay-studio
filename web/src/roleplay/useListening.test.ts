import { effectScope, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useListening } from './useListening'

afterEach(() => vi.restoreAllMocks())

describe('useListening', () => {
  it('plays a moment of silence on the first tap or key, so iOS lets a line play once it is spoken', () => {
    const sources: string[] = []
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
      function (this: HTMLMediaElement) {
        sources.push(this.src.slice(0, 14))
        return Promise.resolve()
      },
    )
    const scope = effectScope()
    scope.run(() =>
      useListening({
        sessionId: 's1',
        session: ref(null),
        jobs: ref([]),
        hasJob: () => false,
        queue: () => {},
        voicesOn: () => true,
      })
    )
    document.body.click()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(sources).toEqual(['data:audio/wav'])
    scope.stop()
  })
})
