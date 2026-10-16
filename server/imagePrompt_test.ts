import { assertEquals } from '@std/assert'
import { earlierSubjects, joinPrompt, subjectSentence } from './imagePrompt.ts'

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

Deno.test('earlierSubjects lists earlier subjects unlike the current one, latest first, once', () => {
  const both = 'Kael is lean; the traveller is slender. They talk.'
  const alone = 'Kael is lean. He drinks.'
  const three = 'Kael is lean; a stranger is hooded. He looks up.'
  assertEquals(earlierSubjects([both, alone, alone], alone), [
    'Kael is lean; the traveller is slender.',
  ])
  assertEquals(earlierSubjects([both, three, alone], alone), [
    'Kael is lean; a stranger is hooded.',
    'Kael is lean; the traveller is slender.',
  ])
  assertEquals(earlierSubjects([both, three, alone], alone, 1), [
    'Kael is lean; a stranger is hooded.',
  ])
  assertEquals(earlierSubjects([], alone), [])
})
