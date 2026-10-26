import { assertEquals } from '@std/assert'
import { paintedMask } from '../testing.ts'
import { maskBoxes } from './maskBoxes.ts'

Deno.test('maskBoxes boxes each separate area painted, and nothing for an empty mask', async () => {
  assertEquals(await maskBoxes(await paintedMask(100, 50)), [])
  // Cells of 10 px: a box covers the cells its area touches.
  assertEquals(await maskBoxes(await paintedMask(100, 50, [12, 5, 38, 18], [70, 30, 95, 48]), 10), [
    { left: 0.1, top: 0, right: 0.4, bottom: 0.4 },
    { left: 0.7, top: 0.6, right: 1, bottom: 1 },
  ])
  // Strokes in neighbouring cells are one area.
  assertEquals(await maskBoxes(await paintedMask(100, 50, [0, 0, 9, 9], [12, 12, 19, 19]), 10), [
    { left: 0, top: 0, right: 0.2, bottom: 0.4 },
  ])
})
