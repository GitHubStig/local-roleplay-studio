import { assertEquals } from '@std/assert'
import { clipSize, findComfyVideoModel } from './models.ts'

const model = (id: string) => findComfyVideoModel(id)!

Deno.test('each model takes its own frame grid: LTX 8n + 1, Wan 4n + 1, MiniMax H3 17k + 5', () => {
  const lengths = [4, 5, 8, 10]
  assertEquals(lengths.map(model('ltx-2.5').frames), [97, 121, 193, 241])
  assertEquals(lengths.map(model('wan-2.2').frames), [65, 81, 129, 161])
  assertEquals(lengths.map(model('minimax-h3').frames), [107, 124, 192, 243])
})

Deno.test('a clip keeps its picture’s shape, at about the model’s pixels, in its steps', () => {
  const ltx = model('ltx-2.5')
  assertEquals(clipSize(ltx, 1280, 704), { width: 1280, height: 704 })
  assertEquals(clipSize(ltx, 2560, 1408), { width: 1280, height: 704 })
  assertEquals(clipSize(ltx, 832, 1216), { width: 800, height: 1152 })
  assertEquals(clipSize(ltx, 1024, 1024), { width: 960, height: 960 })
  assertEquals(clipSize(model('wan-2.2'), 1216, 832), { width: 768, height: 528 })
  assertEquals(clipSize(model('minimax-h3'), 1216, 832), { width: 768, height: 512 })
})
