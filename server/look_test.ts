import { assertEquals, assertThrows } from '@std/assert'
import { cleanLook, matchShown, renameShown } from './look.ts'

Deno.test('matchShown matches names by their words, in the order given, once each', () => {
  const people = [
    { name: 'Ben', identity: 'Ben.' },
    { name: 'Captain Cal Reyes', identity: 'Cal.' },
  ]
  assertEquals(matchShown(people, ['Cal Reyes', 'ben ash', 'BEN', 'Zoe']), [
    'Captain Cal Reyes',
    'Ben',
  ])
})

Deno.test('renameShown follows a renamed person by their place while the Look keeps its size', () => {
  const before = [{ name: 'Ben', identity: 'Ben.' }, { name: 'Cal', identity: 'Cal.' }]
  const renamed = [{ name: 'Benji', identity: 'Benji.' }, { name: 'Cal', identity: 'Cal.' }]
  assertEquals(renameShown(before, renamed, ['Ben', 'Cal']), ['Benji', 'Cal'])
  assertEquals(renameShown(before, [renamed[1]], ['Ben', 'Cal']), ['Cal'])
})

Deno.test('cleanLook tidies a hand-edited Look and refuses one missing what it needs', () => {
  assertEquals(
    cleanLook({ people: [{ name: ' Ben \n Ash ', identity: 'Ben, an adult.' }], style: 'Ink.' }),
    { people: [{ name: 'Ben Ash', identity: 'Ben, an adult.' }], style: 'Ink.' },
  )
  assertThrows(() => cleanLook({ people: [{ name: 'Ben', identity: '' }], style: 'Ink.' }))
  assertThrows(() =>
    cleanLook({
      people: [{ name: 'Ben', identity: 'Ben.' }, { name: 'ben', identity: 'Ben.' }],
      style: 'Ink.',
    })
  )
  assertThrows(() => cleanLook({ people: [], style: '' }))
})
