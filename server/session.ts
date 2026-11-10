import { fromFileUrl, join } from '@std/path'
import type { Outcome, Session } from '../shared/session.ts'

export const OUTCOMES: readonly Outcome[] = ['done', 'declined', 'unclear']

/** Text for a card on Home, cut to 160 characters; null for none. */
export function excerpt(text: string | undefined): string | null {
  const plain = text?.replace(/\s+/g, ' ').trim()
  if (!plain) return null
  return plain.length > 160 ? `${plain.slice(0, 157).trimEnd()}…` : plain
}

export interface SessionStore {
  /** Absolute directory holding a Session's JSON and images. */
  dir(id: string): string
  load(id: string): Promise<Session | undefined>
  /** Every saved Session; unreadable ones are skipped. */
  list(): Promise<Session[]>
  save(session: Session): Promise<void>
  remove(id: string): Promise<void>
}

const SESSION_ID = /^[a-z0-9-]+$/

export interface DirSessionStore extends SessionStore {
  /** The folder the Sessions are in now. */
  root(): string
  /** Keeps Sessions in another folder from now on; the ones in the old one stay there. */
  moveTo(root: string): void
}

/** Stores each Session as `<root>/<id>/session.json` plus its images. */
export function dirSessionStore(root: string | URL): DirSessionStore {
  let base = root instanceof URL ? fromFileUrl(root) : root
  const dir = (id: string) => {
    if (!SESSION_ID.test(id)) throw new Error(`Invalid Session id: ${id}`)
    return join(base, id)
  }
  return {
    root: () => base,
    moveTo: (root) => void (base = root),
    dir,
    async load(id) {
      if (!SESSION_ID.test(id)) return undefined
      try {
        return JSON.parse(await Deno.readTextFile(join(dir(id), 'session.json')))
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) return undefined
        throw err
      }
    },
    async list() {
      let entries: Deno.DirEntry[]
      try {
        entries = await Array.fromAsync(Deno.readDir(base))
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) return []
        throw err
      }
      const sessions = await Promise.all(
        entries
          .filter((e) => e.isDirectory && SESSION_ID.test(e.name))
          .map((e) => this.load(e.name).catch(() => undefined)),
      )
      return sessions.filter((s): s is Session => s !== undefined)
    },
    async save(session) {
      const d = dir(session.id)
      await Deno.mkdir(d, { recursive: true })
      const path = join(d, 'session.json')
      await Deno.writeTextFile(`${path}.tmp`, JSON.stringify(session, null, 2) + '\n')
      await Deno.rename(`${path}.tmp`, path)
    },
    async remove(id) {
      await Deno.remove(dir(id), { recursive: true }).catch((err) => {
        if (!(err instanceof Deno.errors.NotFound)) throw err
      })
    },
  }
}
