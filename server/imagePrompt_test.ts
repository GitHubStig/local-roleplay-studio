import { assertEquals } from '@std/assert'
import { renderPrompt } from './imagePrompt.ts'

Deno.test('renderPrompt always starts with "adult"', () => {
  assertEquals(renderPrompt('A woman on a rooftop.'), 'adult, A woman on a rooftop.')
})
