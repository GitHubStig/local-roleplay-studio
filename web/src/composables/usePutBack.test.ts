import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { usePutBack } from './usePutBack'

describe('usePutBack', () => {
  it('fills an empty box', () => {
    const draft = ref('  ')
    const { offered, putBack } = usePutBack(draft)
    putBack("Frame 3's Action", 'Sit down')
    expect(draft.value).toBe('Sit down')
    expect(offered.value).toBeNull()
  })

  it('keeps a draft, offers what was undone, and swaps them on use', () => {
    const draft = ref('Kneel')
    const { offered, putBack, use, dismiss } = usePutBack(draft)
    putBack("Frame 3's Action", 'Sit down')
    expect(draft.value).toBe('Kneel')
    expect(offered.value).toEqual({ label: "Frame 3's Action", text: 'Sit down' })
    use()
    expect(draft.value).toBe('Sit down')
    expect(offered.value).toEqual({ label: 'Your draft', text: 'Kneel' })
    dismiss()
    expect(offered.value).toBeNull()
  })

  it('offers nothing when the box already holds it, or there was nothing to put back', () => {
    const draft = ref('Sit down')
    const { offered, putBack } = usePutBack(draft)
    putBack("Frame 3's Action", 'Sit down ')
    expect(offered.value).toBeNull()
    putBack('Frame 1', null)
    expect(offered.value).toBeNull()
    expect(draft.value).toBe('Sit down')
  })
})
