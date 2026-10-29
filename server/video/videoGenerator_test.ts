import { assertEquals } from '@std/assert'
import { CLIP_ENDS, clipFrames, clipSize } from './videoGenerator.ts'

Deno.test('a clip is 8n + 1 frames at 24 fps', () => {
  assertEquals([4, 5, 8, 10].map(clipFrames), [97, 121, 193, 241])
})

Deno.test('a clip keeps its picture’s shape, at about 1280×704’s pixels, in steps of 32', () => {
  assertEquals(clipSize(1280, 704), { width: 1280, height: 704 })
  assertEquals(clipSize(2560, 1408), { width: 1280, height: 704 })
  assertEquals(clipSize(832, 1216), { width: 800, height: 1152 })
  assertEquals(clipSize(1024, 1024), { width: 960, height: 960 })
})

Deno.test('each kind of clip puts the picture at its own ends', () => {
  assertEquals(CLIP_ENDS['lead-in'], { last: 'still' })
  assertEquals(CLIP_ENDS['play-out'], { first: 'still' })
  assertEquals(CLIP_ENDS['idle-loop'], { first: 'still', last: 'still' })
  assertEquals(CLIP_ENDS['into-next'], { first: 'still', last: 'next' })
})
