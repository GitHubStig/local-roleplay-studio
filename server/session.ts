import { fromFileUrl, join } from '@std/path'
import type { ImagePrompt } from './imagePrompt.ts'
import type { Settings } from './settings.ts'

/**
 * How a Turn's Action was received. Only `done` can change the Image Prompt; `declined` (it
 * crossed a limit) and `unclear` (it couldn't be understood) leave the Image Prompt and image as
 * they were.
 */
export type Outcome = 'done' | 'declined' | 'unclear'

export const OUTCOMES: readonly Outcome[] = ['done', 'declined', 'unclear']

/** A committed Turn. The Opening Turn has index 0 and no Action. */
export interface Turn {
  index: number
  action: string | null
  /** The Session's whole state after this Turn: one paragraph describing the image. */
  prompt: ImagePrompt
  /** A terse list of what changed, for the player; never fed back to the Text Model. */
  narration: string
  outcome: Outcome
  /** The exact text sent to the Image Model: the sections joined in order. */
  promptText: string
  /** The Text Model's reasoning for this Turn, when thinking was on. */
  thinking?: string
  /** File name of this Turn's image inside the Session directory. */
  image: string
  createdAt: string
}

export interface Session {
  id: string
  scenarioId: string
  /** Settings as they were when the Session started; later edits don't apply. */
  settings: Settings
  /** The seed every image in this Session is rendered with. */
  seed: number
  createdAt: string
  turns: Turn[]
}

export const currentPrompt = (s: Session): ImagePrompt | null => s.turns.at(-1)?.prompt ?? null

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

/** Brings a Session saved by an older version up to date. */
function upgrade(session: Session & { status?: string }): Session {
  delete session.status
  for (const turn of session.turns as (Turn & { declined?: boolean })[]) {
    if (!turn.outcome) turn.outcome = turn.declined ? 'declined' : 'done'
    delete turn.declined
    // Image Prompts were once nine separate Sections; they're one paragraph now.
    const prompt = turn.prompt as unknown
    if (typeof prompt === 'object' && prompt !== null) {
      turn.prompt = Object.values(prompt).map((v) => String(v).trim()).join(' ')
    }
  }
  return session
}

/** Stores each Session as `<root>/<id>/session.json` plus its images. */
export function dirSessionStore(root: string | URL): SessionStore {
  const base = root instanceof URL ? fromFileUrl(root) : root
  const dir = (id: string) => {
    if (!SESSION_ID.test(id)) throw new Error(`Invalid Session id: ${id}`)
    return join(base, id)
  }
  return {
    dir,
    async load(id) {
      if (!SESSION_ID.test(id)) return undefined
      try {
        return upgrade(JSON.parse(await Deno.readTextFile(join(dir(id), 'session.json'))))
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
