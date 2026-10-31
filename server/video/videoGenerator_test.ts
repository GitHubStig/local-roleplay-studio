import { assertEquals } from '@std/assert'
import { CLIP_ENDS } from './videoGenerator.ts'

Deno.test('each kind of clip puts the picture at its own ends', () => {
  assertEquals(CLIP_ENDS['lead-in'], { last: 'still' })
  assertEquals(CLIP_ENDS['play-out'], { first: 'still' })
  assertEquals(CLIP_ENDS['idle-loop'], { first: 'still', last: 'still' })
  assertEquals(CLIP_ENDS['into-next'], { first: 'still', last: 'next' })
})
