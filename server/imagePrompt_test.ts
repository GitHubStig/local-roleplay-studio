import { assertEquals } from '@std/assert'
import { joinPrompt, peopleAway, subjectParts, subjectSentence } from './imagePrompt.ts'

Deno.test('joinPrompt ends each part as a sentence, leaving out an empty one', () => {
  assertEquals(joinPrompt('A tall man', 'He jumps.', 'Ink'), 'A tall man. He jumps. Ink.')
  assertEquals(
    joinPrompt('', 'A door stands closed.', 'Oil paint!'),
    'A door stands closed. Oil paint!',
  )
})

Deno.test('subjectSentence is the first sentence, even with commas and semicolons in it', () => {
  assertEquals(
    subjectSentence('Kael is 42, lean; she is young. He stands. Ink.'),
    'Kael is 42, lean; she is young.',
  )
})

Deno.test("subjectParts reads each person's part by name, in lower case", () => {
  assertEquals(
    [...subjectParts('Kael is lean, 42; and The Traveller is slender. She sits.')],
    [['kael', 'Kael is lean, 42'], ['traveller', 'The Traveller is slender']],
  )
  assertEquals([...subjectParts('A lone figure in a long grey hooded coat. He waits.')], [])
  // A Chain made from a Storyboard joins its identities: "<name>, …".
  assertEquals(
    [...subjectParts('Kael, a lean man; the traveller, a slender woman. They talk.')].map((
      [name],
    ) => name),
    ['kael', 'traveller'],
  )
  assertEquals(
    [...subjectParts('Silas, the hooded stranger, is tall. He waits.')],
    [['silas', 'Silas, the hooded stranger, is tall']],
  )
  assertEquals([...subjectParts('No one is in the picture. A door creaks.')], [])
  // A description split by semicolons is still one person.
  assertEquals(
    [...subjectParts('Kael, a smuggler; lean and rigid, scarred; the traveller, a woman. Ok.')].map(
      (
        [name],
      ) => name,
    ),
    ['kael', 'traveller'],
  )
  // A description that runs on in parts is one person, not "her face".
  assertEquals(
    [...subjectParts('The woman is young; she has red hair; her face is refined. She reads.')].map((
      [name],
    ) => name),
    ['woman'],
  )
})

Deno.test('peopleAway lists everyone pictured before but not now, as last described', () => {
  const both = 'Kael is lean; the traveller is slender. They talk.'
  const alone = 'Kael is lean. He drinks.'
  const stranger = 'Kael is lean; the stranger is hooded. He looks up.'
  const unhooded = 'Kael is lean; the stranger is one-eyed. He looks up.'
  // Gone through any number of other pictures, she's still there.
  assertEquals(peopleAway([both, alone, stranger, unhooded, alone], alone), [
    'the stranger is one-eyed',
    'the traveller is slender',
  ])
  assertEquals(peopleAway([both, alone], both), [])
  assertEquals(peopleAway([], alone), [])
})

Deno.test('subjectSentence ends at the first full stop, even before a lower-case sentence', () => {
  assertEquals(
    subjectSentence('the traveller is slender. the traveller sits.'),
    'the traveller is slender.',
  )
})
