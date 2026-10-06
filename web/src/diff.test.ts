import { describe, expect, it } from 'vitest'
import { diffWords } from './diff'

describe('diffWords', () => {
  it('marks replaced words as removed then added, keeping the rest', () => {
    expect(diffWords('A man, wary, in a tavern.', 'A man, frightened, in a tavern.')).toEqual(
      [
        { kind: 'same', text: 'A man,' },
        { kind: 'removed', text: 'wary,' },
        { kind: 'added', text: 'frightened,' },
        { kind: 'same', text: 'in a tavern.' },
      ],
    )
  })

  it('handles text added at the end and nothing in common', () => {
    expect(diffWords('Rain.', 'Rain. A dark street.')).toEqual([
      { kind: 'same', text: 'Rain.' },
      { kind: 'added', text: 'A dark street.' },
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
