import { describe, expect, it } from 'vitest'
import { diffWords } from './diff'

describe('diffWords', () => {
  it('marks replaced words as removed then added, keeping the rest', () => {
    expect(diffWords('A woman, easy smile, in a studio.', 'A woman, scared, in a studio.')).toEqual(
      [
        { kind: 'same', text: 'A woman,' },
        { kind: 'removed', text: 'easy smile,' },
        { kind: 'added', text: 'scared,' },
        { kind: 'same', text: 'in a studio.' },
      ],
    )
  })

  it('handles text added at the end and nothing in common', () => {
    expect(diffWords('Red sky.', 'Red sky. Rocky ground.')).toEqual([
      { kind: 'same', text: 'Red sky.' },
      { kind: 'added', text: 'Rocky ground.' },
    ])
    expect(diffWords('a', 'b')).toEqual([
      { kind: 'removed', text: 'a' },
      { kind: 'added', text: 'b' },
    ])
  })

  it('finds no changes in identical text', () => {
    expect(diffWords('Same words here.', 'Same words here.')).toEqual([
      { kind: 'same', text: 'Same words here.' },
    ])
  })
})
