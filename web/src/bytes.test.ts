import { describe, expect, it } from 'vitest'
import { bytes } from './api'

describe('bytes', () => {
  it('reads as a size on disk, in thousands', () => {
    expect(bytes(0)).toBe('0 bytes')
    expect(bytes(1)).toBe('1 byte')
    expect(bytes(999)).toBe('999 bytes')
    expect(bytes(1000)).toBe('1 KB')
    expect(bytes(2_340_000_000)).toBe('2.3 GB')
    expect(bytes(640_000_000)).toBe('640 MB')
    expect(bytes(9_960_000)).toBe('10 MB')
    expect(bytes(999_600_000)).toBe('1 GB')
  })
})
