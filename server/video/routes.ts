import { frameName } from '../frames.ts'
import type { StreamEvent } from '../app.ts'
import { error, readJson, type Route } from '../http.ts'
import { clipAsk } from '../jobs.ts'
import { shownVersionOf } from '../pictures.ts'
import type { Session } from '../session.ts'
import type { TextModel } from '../textModel.ts'
import { type ClipRevision, writeClipPrompt } from './clipPrompt.ts'
import { clipRefusal } from './makeClip.ts'

/** What the app lends the clip routes: its locks, streams and the Text Model. */
export interface ClipRouteContext {
  /** Takes the Session's lock, loads it and runs `handle` (see app.ts). */
  locked(
    id: string,
    kind: 'clip-prompt',
    handle: (session: Session) => Promise<Response>,
  ): Promise<Response>
  /** Runs work as a server-sent event stream (see app.ts). */
  stream(
    session: Session,
    frameIndex: number | null,
    discardOnFailure: boolean,
    run: (send: (event: StreamEvent) => void, signal: AbortSignal) => Promise<void>,
  ): Response
  /** The model a clip's prompt is written with: the Session's Text Model, Thinking off. */
  textModel(session: Session): TextModel
}

/** The clip routes every Session kind shares. */
export function clipRoutes(ctx: ClipRouteContext): Route[] {
  return [
    // Writes a clip's prompt for the player to read and edit, then queue as a `clip` job; nothing
    // is saved: `{ kind, seconds, speech }`, and to rewrite one after watching its clip,
    // `revise: { prompt, problem }`.
    [
      'POST',
      new URLPattern({ pathname: '/api/sessions/:id/frames/:index/clip-prompt' }),
      async (req, p) => {
        const body = await readJson(req)
        const ask = clipAsk(body)
        if (typeof ask === 'string') return error(ask, 400)
        const revise = revisionOf((body as { revise?: unknown } | undefined)?.revise)
        if (typeof revise === 'string') return error(revise, 400)
        return ctx.locked(p.id!, 'clip-prompt', (session) => {
          const index = Number(p.index)
          if (!Number.isInteger(index) || !session.frames[index]) {
            return Promise.resolve(error('No such Frame', 404))
          }
          const name = frameName(index)
          const refused = !shownVersionOf(session, index)
            ? `${name} has no picture yet`
            : clipRefusal(session, index, ask.kind, name)
          if (refused) return Promise.resolve(error(refused, 409))
          return Promise.resolve(ctx.stream(session, index, false, async (send, signal) => {
            await writeClipPrompt(ctx.textModel(session), session, index, ask, send, signal, revise)
          }))
        })
      },
    ],
  ]
}

/** The longest prompt or problem a revision takes. */
const MAX_REVISION = 4000

/** A request's `revise`: none, a prompt and what was wrong with its clip, or why it isn't one. */
function revisionOf(value: unknown): ClipRevision | undefined | string {
  if (value === undefined) return undefined
  const v = value as { prompt?: unknown; problem?: unknown } | null
  const prompt = typeof v?.prompt === 'string' ? v.prompt.trim() : ''
  const problem = typeof v?.problem === 'string' ? v.problem.trim() : ''
  if (!prompt || !problem) return 'To rewrite a prompt, give it and say what was wrong'
  if (prompt.length > MAX_REVISION || problem.length > MAX_REVISION) {
    return `A prompt or a problem can be at most ${MAX_REVISION} characters`
  }
  return { prompt, problem }
}
