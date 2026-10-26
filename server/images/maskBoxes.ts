import decodePng from '@jsquash/png/decode.js'

/** A box around an area painted for an edit, in fractions of the picture's width and height. */
export interface MaskBox {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * The separate areas painted in an edit's mask (a PNG, white repainted), each as the box around
 * it, top to bottom. Read on a grid of `cell`-pixel squares, so strokes a few pixels apart, and the
 * edge the web softens, count as one area. For edit models told where to paint by boxes (FLUX.3).
 */
export async function maskBoxes(png: Uint8Array<ArrayBuffer>, cell = 16): Promise<MaskBox[]> {
  const { width, height, data } = await decodePng(
    png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
  )
  const cols = Math.ceil(width / cell)
  const rows = Math.ceil(height / cell)
  const painted = new Uint8Array(cols * rows)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4] > 127) {
        painted[Math.floor(y / cell) * cols + Math.floor(x / cell)] = 1
      }
    }
  }
  const boxes: MaskBox[] = []
  for (let start = 0; start < painted.length; start++) {
    if (painted[start] !== 1) continue
    // Each area's cells, touching at a side or a corner.
    let [left, top, right, bottom] = [cols, rows, 0, 0]
    const stack = [start]
    painted[start] = 2
    while (stack.length) {
      const at = stack.pop()!
      const [col, row] = [at % cols, Math.floor(at / cols)]
      ;[left, top, right, bottom] = [
        Math.min(left, col),
        Math.min(top, row),
        Math.max(right, col),
        Math.max(bottom, row),
      ]
      for (let r = Math.max(0, row - 1); r <= Math.min(rows - 1, row + 1); r++) {
        for (let c = Math.max(0, col - 1); c <= Math.min(cols - 1, col + 1); c++) {
          if (painted[r * cols + c] === 1) {
            painted[r * cols + c] = 2
            stack.push(r * cols + c)
          }
        }
      }
    }
    boxes.push({
      left: left * cell / width,
      top: top * cell / height,
      right: Math.min(width, (right + 1) * cell) / width,
      bottom: Math.min(height, (bottom + 1) * cell) / height,
    })
  }
  return boxes
}
