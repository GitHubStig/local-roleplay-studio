import { assertEquals, assertRejects } from '@std/assert'
import decodePng from '@jsquash/png/decode.js'
import encodePng from '@jsquash/png/encode.js'
import { paintedMask } from '../testing.ts'
import { pasteBack } from './pasteBack.ts'

/** A PNG of one colour. */
async function solid(width: number, height: number, rgb: [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) data.set([...rgb, 255], i)
  return new Uint8Array(await encodePng(new ImageData(data, width, height)))
}

/** The colour of one pixel of a PNG. */
async function pixel(png: Uint8Array<ArrayBuffer>, x: number, y: number) {
  const { width, data } = await decodePng(png.buffer)
  return [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)]
}

Deno.test('pasteBack keeps the picture outside the painted area, and the edit inside it', async () => {
  const picture = await solid(40, 20, [10, 20, 30])
  const edit = await solid(40, 20, [200, 150, 100])
  const out = await pasteBack(picture, edit, await paintedMask(40, 20, [10, 5, 30, 15]))
  assertEquals(await pixel(out, 0, 0), [10, 20, 30, 255])
  assertEquals(await pixel(out, 20, 10), [200, 150, 100, 255])
  await assertRejects(
    async () => pasteBack(picture, await solid(32, 20, [0, 0, 0]), await paintedMask(40, 20)),
    Error,
    'another size',
  )
})
