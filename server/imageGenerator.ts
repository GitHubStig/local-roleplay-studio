import { join } from '@std/path'
import type { Settings } from './settings.ts'

export interface ImageRequest {
  prompt: string
  seed: number
  settings: Settings
  /** Directory to write into. */
  dir: string
  /** File name without extension; the generator picks the extension. */
  name: string
}

export interface ImageGenerator {
  /** Renders the image and returns the file name it wrote inside `dir`. */
  generate(
    req: ImageRequest,
    signal: AbortSignal,
    onProgress?: (step: number, total: number) => void,
  ): Promise<string>
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

/** Stands in for mflux: writes an SVG card showing the prompt, after an optional delay. */
export function placeholderImageGenerator(delayMs = 1500): ImageGenerator {
  return {
    async generate({ prompt, seed, dir, name }, signal) {
      signal.throwIfAborted()
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs)
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(signal.reason)
        }, { once: true })
      })
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
