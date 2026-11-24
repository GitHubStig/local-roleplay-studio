import { ApiError, exportUrl, type LeftOut } from './api'

/** The browser's Save dialog for a file it then writes into (Chrome and Edge have it). */
interface SavePicker {
  showSaveFilePicker(options: {
    suggestedName: string
    types: { description: string; accept: Record<string, string[]> }[]
  }): Promise<{ createWritable(): Promise<WritableStream<Uint8Array>> }>
}

/** Whether this browser can save into a file the player picks, as the export streams. */
export const canPickFile = () => 'showSaveFilePicker' in globalThis

/**
 * How a Session export ended: written into the file picked (`saved`), handed to the browser as a
 * plain download (`download`), or not at all (`cancelled`: the Save dialog closed, or Cancel).
 */
export type ExportEnd = 'saved' | 'download' | 'cancelled'

/**
 * Exports Session `id` as a zip named `name`, all of it, or without what `leftOut` names. Where the browser has a Save dialog, the zip is
 * streamed into the file picked, saying how much is written (`onWritten`), and `signal` stops it,
 * the file left as it was; elsewhere it's a plain download, which the browser shows itself.
 */
export async function exportSession(
  id: string,
  name: string,
  onWritten: (bytes: number) => void,
  signal: AbortSignal,
  leftOut?: LeftOut,
): Promise<ExportEnd> {
  const url = exportUrl(id, leftOut)
  if (!canPickFile()) {
    const link = Object.assign(document.createElement('a'), { href: url, download: name })
    link.click()
    return 'download'
  }
  let file
  try {
    file = await (globalThis as unknown as SavePicker).showSaveFilePicker({
      suggestedName: name,
      types: [{ description: 'Session export', accept: { 'application/zip': ['.zip'] } }],
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') return 'cancelled'
    throw err
  }
  const res = await fetch(url, { signal })
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error ?? `The export failed: ${res.status}`, res.status)
  }
  const writable = await file.createWritable()
  let written = 0
  const counting = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, sink) {
      written += chunk.length
      onWritten(written)
      sink.enqueue(chunk)
    },
  })
  try {
    // Cancelling aborts the fetch, which ends the body in an error, so the pipe aborts the file:
    // nothing half-written is kept.
    await res.body.pipeThrough(counting).pipeTo(writable)
    return 'saved'
  } catch (err) {
    if (signal.aborted) return 'cancelled'
    throw err
  }
}
