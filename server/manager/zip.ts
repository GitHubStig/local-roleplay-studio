/**
 * A Session export: one Session's folder as a zip, streamed as it's written, so nothing is kept on
 * the server, in memory or on disk. It holds the Session's text (`session.json`, first) and every
 * file a part owns (`sessionParts.ts`); its caches, which the app makes again, and anything else in
 * the folder stay out.
 */
import { join } from '@std/path'
import { configure, ZipWriter } from '@zip-js/zip-js'
import { filesIn, partOf } from '../sessionParts.ts'

// Deno runs the codecs in this thread: no web workers to start per entry.
configure({ useWebWorkers: false })

/** The Session's text, in every export, first. */
export const SESSION_FILE = 'session.json'

/**
 * How a zip is written: its compression level, 0 to 9 (0 stores), for every file or by its path, and
 * whether by the runtime's own deflate.
 */
export interface ZipOptions {
  level: number | ((path: string) => number)
  /** Deflate by the runtime's `CompressionStream` (native, at its own level) rather than zip.js's. */
  native?: boolean
  /** Told each entry's size in the zip as it's written (the bench's). */
  onEntry?: (path: string, compressedSize: number) => void
}

/** Files already compressed, which deflate makes barely smaller: pictures, clips, MP3 and FLAC. */
const COMPRESSED = /\.(png|webp|jpg|mp4|mp3|flac)$/

/** Deflates only what isn't compressed already (the text, call logs, 3D, WAV); stores the rest. */
export const deflateUncompressed = (level: number) => (path: string) =>
  COMPRESSED.test(path) ? 0 : level

/**
 * The compression a Session export uses, picked by the bench (`docs/bench/session-zip/`): a Session
 * is mostly pictures, clips and sound, compressed already, which deflate made 0–4% smaller at 20 to
 * 60 times the time; so they're stored, and the rest (its text, call logs, 3D) deflated by the
 * runtime, twice as fast as zip.js's own at any level.
 */
export const EXPORT_ZIP: ZipOptions = { level: deflateUncompressed(6), native: true }

/** The files a Session export holds, by their paths in folder `dir`, with their sizes: its text first. */
export async function exportedFiles(dir: string): Promise<{ path: string; size: number }[]> {
  const files = await filesIn(dir)
  const text = files.find((f) => f.path === SESSION_FILE)
  if (!text) throw new Error(`${dir} holds no ${SESSION_FILE}`)
  const owned = files.filter((f) => partOf(f.path) !== null)
    .sort((a, b) => a.path.localeCompare(b.path))
  return [text, ...owned]
}

/**
 * `files` from folder `dir` (or given whole, as `data`), zipped as the stream is read. Cancelling the stream (a download
 * dropped) stops it; `done` settles once it's all written, or it stopped.
 */
export function zipFiles(
  dir: string,
  files: { path: string; data?: Uint8Array<ArrayBuffer> }[],
  options: ZipOptions,
): { stream: ReadableStream<Uint8Array>; done: Promise<void> } {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const stopped = new AbortController()
  const levelOf = typeof options.level === 'number'
    ? (() => options.level) as (path: string) => number
    : options.level
  const zip = new ZipWriter(writable, {
    useCompressionStream: options.native ?? false,
    signal: stopped.signal,
  })
  const done = (async () => {
    try {
      for (const f of files) {
        if (stopped.signal.aborted) throw stopped.signal.reason
        // A file given whole (a Session's text as an export leaves it), or read from the folder.
        const source = f.data
          ? new Blob([f.data]).stream()
          : (await Deno.open(join(dir, f.path))).readable
        const entry = await zip.add(f.path, source, { level: levelOf(f.path) })
        options.onEntry?.(f.path, entry.compressedSize ?? 0)
      }
      await zip.close()
    } catch (err) {
      await writable.abort(err).catch(() => {})
      if (!stopped.signal.aborted) throw err
    }
  })()
  // What the reader sees: the zip, and its cancelling stops the writing.
  const reader = readable.getReader()
  const stream = new ReadableStream<Uint8Array>({
    async pull(sink) {
      try {
        const { value, done } = await reader.read()
        if (done) sink.close()
        else sink.enqueue(value)
      } catch (err) {
        sink.error(err)
      }
    },
    cancel(reason) {
      stopped.abort(reason ?? new Error('The download was dropped'))
      return reader.cancel(reason).catch(() => {})
    },
  })
  return { stream, done: done.catch(() => {}) }
}
