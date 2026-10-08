import { assertEquals } from '@std/assert'
import { joinPrompt } from './imagePrompt.ts'

Deno.test('joinPrompt ends each part as a sentence, leaving out an empty one', () => {
  assertEquals(joinPrompt('A tall man', 'He jumps.', 'Ink'), 'A tall man. He jumps. Ink.')
  assertEquals(
    joinPrompt('', 'A door stands closed.', 'Oil paint!'),
    'A door stands closed. Oil paint!',
  )
})
