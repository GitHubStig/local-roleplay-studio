import { describe, expect, it } from 'vitest'
import { cueRows } from './cueRows'

const cues = (n: number) => Array.from({ length: n }, (_, i) => i)

describe('cueRows', () => {
  it('keeps the Cues on one row when they fit, or the width is not known', () => {
    expect(cueRows(cues(10), 520, 48)).toEqual([cues(10)])
    expect(cueRows(cues(15), 0, 48)).toEqual([cues(15)])
    expect(cueRows([], 520, 48)).toEqual([])
  })

  it('wraps whole Cues into rows of about as many each', () => {
    // 15 Cues at 48 px need 720: two rows, 8 and 7.
    expect(cueRows(cues(15), 520, 48).map((r) => r.length)).toEqual([8, 7])
    // 25 need 1200: three rows, 9, 9 and 7.
    expect(cueRows(cues(25), 520, 48).map((r) => r.length)).toEqual([9, 9, 7])
  })
})
