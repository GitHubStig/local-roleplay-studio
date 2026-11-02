import decodePng from '@jsquash/png/decode.js'
import encodePng from '@jsquash/png/encode.js'

const decode = (png: Uint8Array<ArrayBuffer>) =>
  decodePng(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength))

/**
 * An edit pasted back over the picture it was made from, through its mask (PNGs of one size, white
 * repainted): outside the painted area the picture stays as it was, and across the edge the web
 * softens the two blend, as ComfyUI's `ImageCompositeMasked` does for its edits. For edit models
 * that change the rest of the picture too (FIBO 2.0 on mflux).
 */
export async function pasteBack(
  picture: Uint8Array<ArrayBuffer>,
  edit: Uint8Array<ArrayBuffer>,
  mask: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const [under, over, painted] = await Promise.all([decode(picture), decode(edit), decode(mask)])
  const sizes = new Set([under, over, painted].map((i) => `${i.width}×${i.height}`))
  if (sizes.size > 1) throw new Error(`Can't paste an edit back over another size: ${[...sizes]}`)
  const out = new Uint8ClampedArray(under.data)
  for (let i = 0; i < out.length; i += 4) {
    const m = painted.data[i] / 255
    for (let c = 0; c < 3; c++) out[i + c] = under.data[i + c] * (1 - m) + over.data[i + c] * m
  }
  return new Uint8Array(await encodePng(new ImageData(out, under.width, under.height)))
}
