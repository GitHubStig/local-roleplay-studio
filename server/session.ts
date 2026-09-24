import { join } from '@std/path'
import type { Settings } from './settings.ts'

export type Scene = Record<string, unknown>

/**
 * How a Turn's Action was received. Only `done` can change the Scene; `declined` (a character
 * refused) and `unclear` (the Action couldn't be understood) leave the Scene and image as they were.
 */
export type Outcome = 'done' | 'declined' | 'unclear'

export const OUTCOMES: readonly Outcome[] = ['done', 'declined', 'unclear']

/** A committed Turn. The Opening Turn has index 0 and no Action. */
export interface Turn {
  index: number
  action: string | null
  scene: Scene
  /** What happened this Turn, for the player; never fed back to the Text Model. */
  narration: string
  outcome: Outcome
  /** The full prompt sent to the Image Model, prefix included. */
  imagePrompt: string
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
  status: 'active' | 'ended'
  createdAt: string
  turns: Turn[]
}

export const currentScene = (s: Session): Scene | null => s.turns.at(-1)?.scene ?? null

export interface SessionStore {
  /** Absolute directory holding a Session's JSON and images. */
  dir(id: string): string
  load(id: string): Promise<Session | undefined>
  save(session: Session): Promise<void>
  remove(id: string): Promise<void>
}

const SESSION_ID = /^[a-z0-9-]+$/

/** Brings a Session saved by an older version up to date. */
function upgrade(session: Session): Session {
  for (const turn of session.turns as (Turn & { declined?: boolean })[]) {
    if (!turn.outcome) turn.outcome = turn.declined ? 'declined' : 'done'
    delete turn.declined
  }
  return session
}

/** Stores each Session as `<root>/<id>/session.json` plus its images. */
export function dirSessionStore(root: string | URL): SessionStore {
  const base = root instanceof URL ? root.pathname : root
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
