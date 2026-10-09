import { join } from '@std/path'
import type { Settings } from '../settings.ts'

export interface ImageRequest {
  prompt: string
  seed: number
  settings: Settings
  /** Directory to write into. */
  dir: string
  /** File name without extension; the generator picks the extension. */
  name: string
}

export interface UpscaleRequest {
  /** Which upscaler model, e.g. `seedvr2-7b`. */
  model: string
  /** File name of the image to upscale, inside `dir`. */
  image: string
  seed: number
  /** Directory to read from and write into. */
  dir: string
  /** File name without extension; the upscaler picks the extension. */
  name: string
}

/** The shortest edge of an upscaled image, in pixels. */
export const UPSCALED_EDGE = 2048

/**
 * Reports a render's step progress, and `onDownload` when it first has to download its model
 * (the first time a model is used); steps after a download mean it's rendering again.
 */
export type OnProgress = (step: number, total: number) => void

/** A preview of the picture as it forms, a JPEG, from a backend that sends them (ComfyUI). */
export type OnPreview = (jpeg: Uint8Array<ArrayBuffer>) => void

export interface ImageGenerator {
  /** Renders the image and returns the file name it wrote inside `dir`. */
  generate(
    req: ImageRequest,
    signal: AbortSignal,
    onProgress?: OnProgress,
    onDownload?: () => void,
    onPreview?: OnPreview,
  ): Promise<string>
  /**
   * Upscales a rendered image so its shortest edge is `UPSCALED_EDGE`, and returns the file name
   * it wrote inside `dir`.
   */
  upscale(
    req: UpscaleRequest,
    signal: AbortSignal,
    onProgress?: OnProgress,
    onDownload?: () => void,
  ): Promise<string>
}

/** Waits `ms`, or rejects as soon as `signal` aborts. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)

function wrap(text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > width) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * Stands in for mflux: writes an SVG card showing the prompt, after an optional delay. Upscaling
 * copies the card under the new name.
 */
export function placeholderImageGenerator(delayMs = 1500): ImageGenerator {
  return {
    async upscale({ image, dir, name }, signal) {
      await delay(delayMs, signal)
      const file = `${name}${image.slice(image.lastIndexOf('.'))}`
      await Deno.copyFile(join(dir, image), join(dir, file))
      return file
    },
    async generate({ prompt, seed, dir, name }, signal) {
      await delay(delayMs, signal)
      const hue = seed % 360
      const lines = wrap(prompt, 48).slice(0, 22)
      const text = lines
        .map((l, i) => `<text x="40" y="${120 + i * 30}">${escapeXml(l)}</text>`)
        .join('')
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="832" height="1216" viewBox="0 0 832 1216">
<rect width="100%" height="100%" fill="hsl(${hue} 30% 22%)"/>
<g font-family="ui-monospace, monospace" font-size="20" fill="hsl(${hue} 40% 88%)">
<text x="40" y="70" font-size="26" font-weight="bold">Placeholder image</text>${text}</g>
</svg>\n`
      const file = `${name}.svg`
      await Deno.writeTextFile(join(dir, file), svg)
      return file
    },
  }
}
