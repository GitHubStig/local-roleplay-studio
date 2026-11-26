import { assertEquals } from '@std/assert'
import { namedIdentity, withoutName } from './identity.ts'
import { parseLook } from './frameBody.ts'
import { cleanLook } from './look.ts'

Deno.test('withoutName takes a name written at the front of an identity off, and nothing else', () => {
  assertEquals(withoutName('Kael', 'Kael, a 42-year-old man.'), 'a 42-year-old man.')
  assertEquals(withoutName('Leia Organa', 'leia organa: a woman of 19.'), 'a woman of 19.')
  assertEquals(withoutName('Kael', 'Kael is a 42-year-old man.'), 'a 42-year-old man.')
  assertEquals(withoutName('the barkeep', 'The barkeep, a stout man.'), 'a stout man.')
  // Only the name as a whole word, and only at the front.
  assertEquals(withoutName('Kael', "Kaelen's twin, a man."), "Kaelen's twin, a man.")
  assertEquals(withoutName('Kael', 'a man, like Kael, tall.'), 'a man, like Kael, tall.')
  // Never leaves it empty.
  assertEquals(withoutName('Kael', 'Kael.'), 'Kael.')
})

Deno.test('namedIdentity puts the name in front, starting a sentence', () => {
  assertEquals(
    namedIdentity({ name: 'Kael', identity: 'a 42-year-old man.' }),
    'Kael, a 42-year-old man.',
  )
  assertEquals(
    namedIdentity({ name: 'Kael', identity: 'A 42-year-old man.' }),
    'Kael, a 42-year-old man.',
  )
  assertEquals(
    namedIdentity({ name: 'the barkeep', identity: 'an old man with an IT-O droid.' }),
    'The barkeep, an old man with an IT-O droid.',
  )
})

Deno.test("A Look's identities lose a name written into them, from the model or by hand", () => {
  const people = [{ name: 'Kael', identity: 'Kael, a tall man.' }, {
    name: 'Mira',
    identity: 'a woman.',
  }]
  const want = [{ name: 'Kael', identity: 'a tall man.' }, { name: 'Mira', identity: 'a woman.' }]
  assertEquals(parseLook({ people, style: 'Ink.' }).subjects, want)
  assertEquals(cleanLook({ subjects: people, style: 'Ink.' }).subjects, want)
})
