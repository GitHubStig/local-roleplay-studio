/**
 * The area the face pass repaints over a head: its box grown by a fifth of its size on each side,
 * its edge softened, white on black, as the 2026-11-25 bench found showed no seam
 * (docs/reference-sheets-plans.md, stage 0: 20%, blurred 24 px at 1024²).
 */
import decodePng from '@jsquash/png/decode.js'
import encodePng from '@jsquash/png/encode.js'
import type { Head } from '../heads/heads.ts'

/** How far the box is grown on each side, as a share of its width and height. */
export const GROW = 0.2
/** How soft its edge is at 1024 px on the shorter side, in pixels (a Gaussian's sigma). */
const SOFTEN_AT_1024 = 24

/** A head's box, in thousandths, grown by `GROW` and kept inside the picture. */
export function grownBox(box: Head['box']): Head['box'] {
  const [x1, y1, x2, y2] = box
  const dx = (x2 - x1) * GROW
  const dy = (y2 - y1) * GROW
  return [
    Math.max(0, x1 - dx),
    Math.max(0, y1 - dy),
    Math.min(1000, x2 + dx),
    Math.min(1000, y2 + dy),
  ]
}

/** The area over `box` (thousandths) for a picture of `size`, as a PNG: white repainted. */
export async function headArea(
  box: Head['box'],
  size: { width: number; height: number },
): Promise<Uint8Array<ArrayBuffer>> {
  const { width, height } = size
  const [x1, y1, x2, y2] = grownBox(box)
  let values = new Float32Array(width * height)
  const left = Math.round((x1 / 1000) * width)
  const right = Math.round((x2 / 1000) * width)
  const top = Math.round((y1 / 1000) * height)
  const bottom = Math.round((y2 / 1000) * height)
  for (let y = top; y < bottom; y++) values.fill(1, y * width + left, y * width + right)
  // Three box blurs, each way, stand in for a Gaussian: a box of 2r + 1 three times over has a
  // sigma of about r.
  const radius = Math.max(1, Math.round(SOFTEN_AT_1024 * Math.min(width, height) / 1024))
  for (let pass = 0; pass < 3; pass++) {
    values = boxBlur(values, width, height, radius, true)
    values = boxBlur(values, width, height, radius, false)
  }
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < values.length; i++) {
    const v = Math.round(values[i] * 255)
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v
    rgba[i * 4 + 3] = 255
  }
  return new Uint8Array(await encodePng(new ImageData(rgba, width, height)))
}

/**
 * Whether an area painted for an edit (`png`, white repainted, at any size) touches `box`
 * (thousandths): a pixel in the box more than half white. So an edit's face pass repaints only the
 * heads its edit may have changed (docs/reference-sheets-plans.md, stage 5).
 */
export async function touches(png: Uint8Array<ArrayBuffer>, box: Head['box']): Promise<boolean> {
  const { data, width, height } = await decodePng(
    png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
  )
  const [x1, y1, x2, y2] = box
  const left = Math.floor((x1 / 1000) * width)
  const right = Math.ceil((x2 / 1000) * width)
  const top = Math.floor((y1 / 1000) * height)
  const bottom = Math.ceil((y2 / 1000) * height)
  for (let y = Math.max(0, top); y < Math.min(height, bottom); y++) {
    for (let x = Math.max(0, left); x < Math.min(width, right); x++) {
      if (data[(y * width + x) * 4] > 127) return true
    }
  }
  return false
}

/** One box blur along rows (`across`) or columns, its edges held at what they are. */
function boxBlur(
  from: Float32Array<ArrayBuffer>,
  width: number,
  height: number,
  r: number,
  across: boolean,
): Float32Array<ArrayBuffer> {
  const to = new Float32Array(from.length)
  const lines = across ? height : width
  const length = across ? width : height
  const at = (line: number, i: number) => across ? line * width + i : i * width + line
  const span = 2 * r + 1
  for (let line = 0; line < lines; line++) {
    const value = (i: number) => from[at(line, Math.min(length - 1, Math.max(0, i)))]
    let sum = 0
    for (let i = -r; i <= r; i++) sum += value(i)
    for (let i = 0; i < length; i++) {
      to[at(line, i)] = sum / span
      sum += value(i + r + 1) - value(i - r)
    }
  }
  return to
}
