import decodePng from '@jsquash/png/decode.js'
import resize from '@jsquash/resize'
import encodeWebp from '@jsquash/webp/encode.js'

/**
 * Pictures as WebP, in WebAssembly (jSquash's builds of Squoosh's codecs), so it runs the same on
 * every machine with nothing to install. A 1024 px picture takes about 0.1 s at quality 90
 * (Mac, 2026-10-11).
 */

/** How a picture is encoded: its quality (0–100), and the height to shrink it to, if taller. */
export interface WebpOptions {
  quality: number
  maxHeight?: number
}

/** A PNG (as `Deno.readFile` gives it) as WebP, with the size it came out. */
export async function pngToWebp(
  png: Uint8Array<ArrayBuffer>,
  opts: WebpOptions,
): Promise<{ data: Uint8Array; width: number; height: number }> {
  let image: ImageData = await decodePng(
    png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
  )
  if (opts.maxHeight && image.height > opts.maxHeight) {
    const height = opts.maxHeight
    image = await resize(image, { height, width: Math.round(image.width * height / image.height) })
  }
  const data = new Uint8Array(await encodeWebp(image, { quality: opts.quality }))
  return { data, width: image.width, height: image.height }
}
