/**
 * A Session import: a Session export unpacked into the Session folder as a new Session. The zip,
 * already saved to a file, is checked whole before anything is unpacked, and refused if it isn't
 * one the app made or could have: no `session.json` at its root, an entry that would land outside
 * the Session's folder, a link, more than the drive has room for, or a `session.json` newer than
 * this app. It's unpacked into a temporary folder and moved into place only once it's all there,
 * so a failed import leaves nothing behind.
 */
import { dirname, join, resolve, SEPARATOR } from '@std/path'
import { type Entry, type FileEntry, Reader, TextWriter, ZipReader } from '@zip-js/zip-js'
import { sessionFile } from '../migrations/session/index.ts'
import { partOf } from '../sessionParts.ts'
import { Refusal } from '../refusal.ts'
import type { SessionStore } from '../session.ts'
import { type Session, SESSION_TITLE_LENGTH } from '../../shared/session.ts'
import { SESSION_FILE } from './zip.ts'
import { bytes } from '../../shared/bytes.ts'

/** Why a zip can't be imported, which the player can act on. */
export class ImportRefusal extends Refusal {
  static override status = 400
}

/** A zip that won't fit on the drive. */
export class NoRoomRefusal extends Refusal {
  static override status = 507
}

/** A zip read from a file, at the offsets zip.js asks for, never all in memory. */
class FileReader extends Reader<Deno.FsFile> {
  constructor(private file: Deno.FsFile) {
    super(file)
  }
  override async init() {
    this.size = (await this.file.stat()).size
  }
  override async readUint8Array(index: number, length: number) {
    const buffer = new Uint8Array(length)
    await this.file.seek(index, Deno.SeekMode.Start)
    let read = 0
    while (read < length) {
      const n = await this.file.read(buffer.subarray(read))
      if (n === null) break
      read += n
    }
    return buffer.subarray(0, read)
  }
}

/** Whether a zip entry's name would land outside the folder it's unpacked into. */
export function escapes(name: string): boolean {
  if (/^([/\\]|[a-zA-Z]:)/.test(name)) return true
  return name.split(/[/\\]/).some((part) => part === '..')
}

/** A stream that writes into `sink`, refusing more than `most` bytes (what the entry declared). */
function capped(sink: WritableStream<Uint8Array>, most: number, name: string) {
  let written = 0
  const writer = sink.getWriter()
  return new WritableStream<Uint8Array>({
    async write(chunk) {
      written += chunk.length
      if (written > most) {
        throw new ImportRefusal(`${name} holds more than its zip says: it isn't a Session export`)
      }
      await writer.write(chunk)
    },
    close: () => writer.close(),
    abort: (reason) => writer.abort(reason),
  })
}

export interface ImportDeps {
  store: SessionStore
  newSessionId(): string
  /** Bytes free on the drive holding a folder; null if it can't be told. */
  freeSpace(path: string): Promise<number | null>
}

/** The title an imported Session takes: its own, marked "(imported)" if a Session here has it. */
export function importedTitle(title: string, taken: Iterable<string>): string {
  if (!new Set(taken).has(title)) return title
  const mark = ' (imported)'
  return `${title.slice(0, SESSION_TITLE_LENGTH - mark.length).trimEnd()}${mark}`
}

/** Unpacks the zip at `zipPath` as a new Session; it's refused, leaving nothing, if it can't be. */
export async function importZip(zipPath: string, deps: ImportDeps): Promise<Session> {
  const file = await Deno.open(zipPath)
  const zip = new ZipReader(new FileReader(file), { filenameValidation: 'tolerant' })
  const id = deps.newSessionId()
  const target = deps.store.dir(id)
  const temp = join(dirname(target), `.import-${id}`)
  try {
    let entries: Entry[]
    try {
      entries = await zip.getEntries()
    } catch (err) {
      throw new ImportRefusal(`This isn't a zip that can be read: ${(err as Error).message}`)
    }
    const text = entries.find((e): e is FileEntry => !e.directory && e.filename === SESSION_FILE)
    if (!text) {
      throw new ImportRefusal(`This isn't a Session export: it has no ${SESSION_FILE} at its root`)
    }
    const outside = entries.find((e) => escapes(e.filename))
    if (outside) {
      throw new ImportRefusal(
        `${outside.filename} would land outside the Session's folder: it isn't a Session export`,
      )
    }
    const link = entries.find((e) => e.symlink)
    if (link) {
      throw new ImportRefusal(`${link.filename} is a link, which a Session export never holds`)
    }

    // What's unpacked: its text and what a part owns; anything else a zip holds is left out.
    const kept = entries.filter((e): e is FileEntry =>
      !e.directory && (e.filename === SESSION_FILE || partOf(e.filename) !== null)
    )
    const size = kept.reduce((n, e) => n + e.uncompressedSize, 0)
    const free = await deps.freeSpace(dirname(target))
    if (free !== null && size > free) {
      throw new NoRoomRefusal(`It unpacks to ${bytes(size)}, and the drive has ${bytes(free)} free`)
    }

    // Its text, checked before any file is unpacked: a newer version can't be read here.
    let doc: unknown
    try {
      doc = JSON.parse(await text.getData(new TextWriter()))
    } catch (err) {
      throw new ImportRefusal(`Its ${SESSION_FILE} can't be read: ${(err as Error).message}`)
    }
    const version = (doc as { version?: unknown })?.version
    if (typeof version === 'number' && version > sessionFile.latest) {
      throw new ImportRefusal('This Session was made by a newer version of the app: update first')
    }
    let session: Session
    try {
      session = sessionFile.migrate(doc, SESSION_FILE)
    } catch (err) {
      throw new ImportRefusal(`Its ${SESSION_FILE} can't be read: ${(err as Error).message}`)
    }

    await Deno.mkdir(temp)
    for (const entry of kept) {
      if (entry.filename === SESSION_FILE) continue
      const path = resolve(temp, entry.filename)
      if (!path.startsWith(resolve(temp) + SEPARATOR)) {
        throw new ImportRefusal(`${entry.filename} would land outside the Session's folder`)
      }
      await Deno.mkdir(dirname(path), { recursive: true })
      const out = await Deno.open(path, { write: true, createNew: true })
      await entry.getData(capped(out.writable, entry.uncompressedSize, entry.filename))
    }
    const titles = (await deps.store.list()).map((s) => s.title)
    const imported = { ...session, id, title: importedTitle(session.title, titles) } as Session
    await Deno.writeTextFile(
      join(temp, SESSION_FILE),
      JSON.stringify(sessionFile.stamp(imported), null, 2) + '\n',
    )
    await Deno.rename(temp, target)
    return imported
  } catch (err) {
    await Deno.remove(temp, { recursive: true }).catch(() => {})
    throw err
  } finally {
    await zip.close().catch(() => {})
    file.close()
  }
}
