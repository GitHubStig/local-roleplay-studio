/**
 * Pictures and captions as vectors, for the Compare dialog's style scores (`scores.ts`): each
 * picture by CSD, a model that tells art styles apart whatever the picture shows, and by CLIP, which
 * also embeds each Frame's caption, so a picture can be checked against what it was meant to show.
 * Run through uv (`python/style/make.py`), once per scoring, with only what isn't embedded yet.
 */
import { join } from '@std/path'
import { pythonScript, SHIPPED_PYTHON, type ToolOptions } from '../pythonTools.ts'
import { runModelScript } from '../modelScript.ts'

/** Unit-length vectors, as base64 of little-endian float32. */
export interface Embeddings {
  /** By the picture's path as asked. */
  images: Record<string, { csd: string; clip: string }>
  /** By the caption. */
  texts: Record<string, string>
}

export interface StyleEmbedder {
  /**
   * Embeds `images` (paths) and `texts`. `onProgress` hears how many pictures are done;
   * `onDownload`, true while the models download (their first use), then false.
   */
  embed(
    req: { images: string[]; texts: string[] },
    signal: AbortSignal,
    onProgress?: (done: number, total: number) => void,
    onDownload?: (downloading: boolean) => void,
  ): Promise<Embeddings>
}

/** Runs `python/style/make.py` through uv; `command` replaces `uv run …` in tests. */
export function uvStyleEmbedder(opts: ToolOptions = {}): StyleEmbedder {
  return {
    async embed(req, signal, onProgress, onDownload) {
      const dir = await Deno.makeTempDir({ prefix: 'style-' })
      try {
        const [request, out] = [join(dir, 'request.json'), join(dir, 'embeddings.json')]
        await Deno.writeTextFile(request, JSON.stringify(req))
        await runModelScript(
          opts.command ??
            ['uv', 'run', '--quiet', pythonScript(opts.python ?? SHIPPED_PYTHON, 'style')],
          ['--in', request, '--out', out],
          'CSD and CLIP',
          signal,
          onDownload,
          (line) => {
            const done = line.match(/^Embedded (\d+) of (\d+)$/)
            if (done) onProgress?.(Number(done[1]), Number(done[2]))
          },
        )
        return JSON.parse(await Deno.readTextFile(out))
      } finally {
        await Deno.remove(dir, { recursive: true }).catch(() => {})
      }
    },
  }
}

/** A base64 vector (`Embeddings`) as numbers. */
export function decodeVector(b64: string): Float32Array {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return new Float32Array(bytes.buffer)
}
