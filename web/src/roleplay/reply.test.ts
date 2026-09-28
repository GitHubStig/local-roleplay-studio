import { describe, expect, it } from 'vitest'
import { cleanReply } from './reply'

describe('cleanReply', () => {
  it('shows saved Replies without stray quote marks or JSON fragments', () => {
    const clean = (dialogue: string) => cleanReply({ internal: '', actions: 'She nods.', dialogue })
    expect(clean('"Keep going. Please.”}').dialogue).toBe('Keep going. Please.')
    expect(clean('"').dialogue).toBe('')
    expect(clean('He said "no" twice.').dialogue).toBe('He said "no" twice.')
  })
})
