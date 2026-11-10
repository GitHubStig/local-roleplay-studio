import { describe, expect, it } from 'vitest'
import type { Cast } from './api'
import { castSectionsOf, isList } from './castSections'

const cast = {
  character: { name: 'Kael', age: 52 },
  persona: { name: 'Elara' },
  setting: { place: 'A tavern' },
  truths: ['No magic', ' '],
  others: [],
} as unknown as Cast
const names = { character: 'Kael', persona: 'Elara' }

describe('castSectionsOf', () => {
  it('gives each group a section while the Cast is reviewed, every box editable', () => {
    const sections = castSectionsOf(cast, false, names)
    expect(sections.map((s) => [s.id, s.preview])).toEqual([
      ['character', 'Kael'],
      ['persona', 'Elara'],
      ['setting', 'A tavern'],
      ['others', 'none'],
      ['truths', 'No magic'],
    ])
    expect(sections.some((s) => s.locked)).toBe(false)
    expect(sections[0].parts[0].fields.map((f) => f.key)).toContain('goal')
  })

  it('locks how it started once begun, leaving what still steers the Character', () => {
    const [start, character, ...lists] = castSectionsOf(cast, true, names)
    expect([start.id, start.locked, start.preview]).toEqual([
      'start',
      true,
      'Kael, 52 · Elara · A tavern',
    ])
    expect(start.parts.map((p) => p.id)).toEqual([
      'start.character',
      'start.persona',
      'start.setting',
    ])
    // Name, age and looks are how it started; the rest still steers.
    expect(start.parts[0].fields.map((f) => f.key)).toEqual(['name', 'age', 'appearance'])
    expect(character.parts[0].fields.map((f) => f.key)).toEqual([
      'personality',
      'voice',
      'background',
      'goal',
    ])
    expect(lists.map((s) => s.id)).toEqual(['others', 'truths'])
  })

  it('knows which parts are lists', () => {
    expect([isList('truths'), isList('others'), isList('character')]).toEqual([true, true, false])
  })
})
