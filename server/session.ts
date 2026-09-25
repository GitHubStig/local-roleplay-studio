import { fromFileUrl, join } from '@std/path'
import type { ImagePrompt } from './imagePrompt.ts'
import type { Settings } from './settings.ts'

/**
 * How a Frame's Action was received. Only `done` can change the Image Prompt; `declined` (it
 * crossed a limit) and `unclear` (it couldn't be understood) leave the Image Prompt and image as
 * they were.
 */
export type Outcome = 'done' | 'declined' | 'unclear'

export const OUTCOMES: readonly Outcome[] = ['done', 'declined', 'unclear']

/** How long a Frame's steps took, in seconds (one decimal place). */
export interface FrameTimings {
  /** Writing the new Image Prompt, including the Limits check. */
  text: number
  /** Waiting for another Session's render to finish; only present if it had to wait. */
  queued?: number
  /** Rendering the image; null when the previous image was reused. */
  image: number | null
}

/** What every Frame has, in a Chain or a Storyboard. */
interface FrameBase {
  index: number
  /** One paragraph describing the image. */
  prompt: ImagePrompt
  /** The exact text sent to the Image Model. */
  promptText: string
  /** File name of this Frame's image inside the Session directory; null until rendered. */
  image: string | null
  /** File name of the image upscaled to 2048 px, once the player has upscaled it. */
  upscaled?: string
  timings?: FrameTimings
  createdAt: string
}

/** A committed Chain Frame. The Opening Frame has index 0 and no Action. */
export interface ChainFrame extends FrameBase {
  action: string | null
  /** A terse list of what changed, for the player; never fed back to the Text Model. */
  narration: string
  outcome: Outcome
  /** The Text Model's reasoning for this Frame, when thinking was on. */
  thinking?: string
  /** Chain Frames always have an image. */
  image: string
}

/** A Storyboard Frame: planned from a Beat, edited and rendered on its own. */
export interface StoryboardFrame extends FrameBase {
  /** What happens in this Frame, from the Storyboard's plan. */
  beat: string
  /**
   * The seven sentences only this Frame has (pose, expression, camera, clothing, environment,
   * lighting, color); the prompt is the Look's subject sentence, these, then its style sentence.
   */
  body: string
  /** The prompt changed after the image was rendered, so the image is out of date. */
  stale?: boolean
  /** Why the Frame can't be rendered: it crossed a Limit and must be edited first. */
  blocked?: string
}

export type Frame = ChainFrame | StoryboardFrame

/** The identity and art style every Frame of a Storyboard shares, word for word. */
export interface Look {
  /** The subject-and-identity sentence. */
  subject: string
  /** The art-style-and-medium sentence. */
  style: string
}

/**
 * What kind of Session: a Chain makes each Frame from the previous one by an Action; a
 * Storyboard plans all its Frames together from the Brief.
 */
export type SessionKind = 'chain' | 'storyboard'

interface SessionBase {
  id: string
  /** The typed Brief this Session started from; null when it started from a Scenario. */
  brief: string | null
  /** The Scenario it started from (a saved Brief); null when started from a typed Brief. */
  scenarioId: string | null
  /** Settings as they were when the Session started; later edits don't apply. */
  settings: Settings
  /** The seed every image in this Session is rendered with. */
  seed: number
  createdAt: string
}

export interface ChainSession extends SessionBase {
  kind: 'chain'
  frames: ChainFrame[]
}

export interface StoryboardSession extends SessionBase {
  kind: 'storyboard'
  /** How many Frames to plan. */
  frameCount: number
  /** Null until the Storyboard has been planned. */
  look: Look | null
  frames: StoryboardFrame[]
}

export type Session = ChainSession | StoryboardSession

export const currentPrompt = (s: ChainSession): ImagePrompt | null =>
  s.frames.at(-1)?.prompt ?? null

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
