import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportSession } from './sessionExport'
import { importSession } from './api'

afterEach(() => vi.unstubAllGlobals())

/** A Save dialog whose file collects what's written, or which the player closes. */
function pickerSaving(closed = false) {
  const written: Uint8Array[] = []
  vi.stubGlobal(
    'showSaveFilePicker',
    vi.fn(() =>
      closed
        ? Promise.reject(Object.assign(new Error('closed'), { name: 'AbortError' }))
        : Promise.resolve({
          createWritable: () =>
            Promise.resolve(new WritableStream<Uint8Array>({ write: (c) => void written.push(c) })),
        })
    ),
  )
  return written
}

describe('exportSession', () => {
  it('streams the zip into the file picked, saying how much is written', async () => {
    const written = pickerSaving()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3, 4])))))
    const seen: number[] = []
    const end = await exportSession(
      's1',
      'x-s1.zip',
      (n) => seen.push(n),
      new AbortController().signal,
    )
    expect(end).toBe('saved')
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/export', expect.anything())
    expect(written.flatMap((c) => [...c])).toEqual([1, 2, 3, 4])
    expect(seen.at(-1)).toBe(4)
  })

  it('does nothing when the Save dialog is closed', async () => {
    pickerSaving(true)
    vi.stubGlobal('fetch', vi.fn())
    expect(await exportSession('s1', 'x.zip', () => {}, new AbortController().signal)).toBe(
      'cancelled',
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('says why the server refused it', async () => {
    pickerSaving()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ error: 'Work is running' }, { status: 409 }))),
    )
    await expect(exportSession('s1', 'x.zip', () => {}, new AbortController().signal)).rejects
      .toThrow('Work is running')
  })

  it('is a plain download where the browser has no Save dialog', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    expect(await exportSession('s1', 'x-s1.zip', () => {}, new AbortController().signal)).toBe(
      'download',
    )
    const link = click.mock.contexts[0] as HTMLAnchorElement
    expect([link.getAttribute('href'), link.download]).toEqual([
      '/api/sessions/s1/export',
      'x-s1.zip',
    ])
    click.mockRestore()
  })
})

describe('importSession', () => {
  /** An XMLHttpRequest that answers as told once sent, keeping what it was sent. */
  function xhrAnswering(status: number, body: unknown) {
    const sent: { headers: Record<string, string>; body?: unknown; aborted: boolean }[] = []
    vi.stubGlobal(
      'XMLHttpRequest',
      class {
        upload: { onprogress?: (e: { loaded: number; total: number }) => void } = {}
        status = 0
        responseText = ''
        onload?: () => void
        onabort?: () => void
        record = {
          headers: {} as Record<string, string>,
          body: undefined as unknown,
          aborted: false,
        }
        open() {}
        setRequestHeader(k: string, v: string) {
          this.record.headers[k] = v
        }
        send(b: unknown) {
          this.record.body = b
          sent.push(this.record)
          queueMicrotask(() => {
            this.upload.onprogress?.({ loaded: 3, total: 3 })
            this.status = status
            this.responseText = JSON.stringify(body)
            if (!this.record.aborted) this.onload?.()
          })
        }
        abort() {
          this.record.aborted = true
          this.onabort?.()
        }
      },
    )
    return sent
  }

  it('uploads the zip as itself, saying how much is sent, and answers the new Session', async () => {
    const sent = xhrAnswering(201, { id: 's2', kind: 'chain', title: 'Tavern (imported)' })
    const zip = new Blob(['zip'])
    const progress: number[] = []
    const made = await importSession(zip, (n) => progress.push(n), new AbortController().signal)
    expect(made.id).toBe('s2')
    expect(sent[0].headers['Content-Type']).toBe('application/zip')
    expect(sent[0].body).toBe(zip)
    expect(progress).toEqual([3])
  })

  it('says why it was refused, and stops when cancelled', async () => {
    xhrAnswering(400, { error: "This isn't a Session export" })
    await expect(importSession(new Blob(['x']), () => {}, new AbortController().signal))
      .rejects.toThrow("This isn't a Session export")
    const sent = xhrAnswering(201, {})
    const stop = new AbortController()
    const going = importSession(new Blob(['x']), () => {}, stop.signal)
    stop.abort()
    await expect(going).rejects.toMatchObject({ name: 'AbortError' })
    expect(sent[0].aborted).toBe(true)
  })
})
