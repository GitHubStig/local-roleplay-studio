import { assertEquals, assertThrows } from '@std/assert'
import { pngHeader } from './testing.ts'
import { pngSize } from './png.ts'

Deno.test("pngSize reads a PNG's width and height from its header", () => {
  const png = pngHeader(1216, 832)
  assertEquals(pngSize(png), { width: 1216, height: 832 })
  assertThrows(() => pngSize(new TextEncoder().encode('<svg></svg>')), Error, 'Not a PNG')
})
