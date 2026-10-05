import { error, json, readJson, type Route } from '../http.ts'
import type { StreamEvent } from '../app.ts'
import type { Scenario } from '../scenario.ts'
import type { Session, SessionStore } from '../session.ts'
import type { SessionJobs } from '../jobs.ts'
import {
  beginRoleplay,
  type RoleplayDeps,
  RoleplayError,
  RoleplayLimitError,
  sendMessage,
  setCast,
  setLook,
  undoLatestExchange,
  writeCast,
} from './engine.ts'
import type { RoleplayModel } from './model.ts'
import { CastError } from './prompt.ts'
import { suggestMessage } from './suggest.ts'
import { setVoiceDescription, VoiceError } from './voice.ts'
import type { RoleplaySession } from './types.ts'

/** A player's message can be at most this long. */
const MAX_MESSAGE_LENGTH = 4000

type RoleplayLockKind = 'setup' | 'frame' | 'undo' | 'edit' | 'render' | 'suggest'

/** What the app lends a Session kind's routes: its locks, streams and models. */
export interface RoleplayRouteContext {
  /** Takes the Session's lock, loads it and runs `handle` (see app.ts). */
  locked(
    id: string,
    kind: RoleplayLockKind,
    handle: (session: Session) => Promise<Response>,
  ): Promise<Response>
  /** Runs work as a server-sent event stream (see app.ts). */
  stream(
    session: Session,
    frameIndex: number | null,
    discardOnFailure: boolean,
    run: (send: (event: StreamEvent) => void, signal: AbortSignal) => Promise<void>,
  ): Response
  scenarioFor(session: Session): Promise<Scenario | Response>
  deps(session: Session): RoleplayDeps
  /** The model Suggest writes with: the Session's Text Model, Thinking off. */
  suggestModel(session: Session): RoleplayModel
  /** Background work (pictures, renders, upscales…), to cancel what an Undo leaves behind. */
  jobs: SessionJobs
  store: SessionStore
}

/** The routes only a Roleplay has, under `/api/sessions/:id/roleplay/`. */
export function roleplayRoutes(ctx: RoleplayRouteContext): Route[] {
  const path = (rest: string) => new URLPattern({ pathname: `/api/sessions/:id/roleplay/${rest}` })

  /** Runs `handle` on a Roleplay, turning the engine's refusals into responses. */
  const withRoleplay = (
    id: string,
    kind: RoleplayLockKind,
    handle: (session: RoleplaySession) => Promise<Response>,
  ) =>
    ctx.locked(id, kind, async (session) => {
      if (session.kind !== 'roleplay') return error('Only a Roleplay has this', 409)
      try {
        return await handle(session)
      } catch (err) {
        if (err instanceof RoleplayError) return error(err.message, 409)
        if (err instanceof RoleplayLimitError) return error(err.message, 422)
        // A hand-edited Cast that's incomplete, or a Character under 18.
        if (err instanceof CastError || err instanceof VoiceError) return error(err.message, 400)
        throw err
      }
    })

  return [
    ['POST', path('cast'), (_req, p) =>
      withRoleplay(p.id!, 'setup', async (session) => {
        if (session.frames.length) return error('The scene has already begun', 409)
        const scenario = await ctx.scenarioFor(session)
        if (scenario instanceof Response) return scenario
        // A Roleplay whose first Cast was never written never started, like a Chain's Opening
        // Frame; a failed rewrite keeps the Cast it had.
        return ctx.stream(session, null, !session.cast, async (send, signal) => {
          await writeCast(ctx.deps(session), session, scenario, send, signal)
        })
      })],

    ['POST', path('begin'), (_req, p) =>
      withRoleplay(p.id!, 'frame', async (session) => {
        if (!session.cast) return error('This Roleplay has no Cast yet', 409)
        if (session.frames.length) return error('The scene has already begun', 409)
        return ctx.stream(session, 0, false, async (send, signal) => {
          await beginRoleplay(ctx.deps(session), session, send, signal)
        })
      })],

    ['POST', path('messages'), (req, p) =>
      withRoleplay(p.id!, 'frame', async (session) => {
        if (!session.frames.length) return error('The scene has not begun yet', 409)
        const body = await readJson(req) as { text?: unknown } | undefined
        const text = typeof body?.text === 'string' ? body.text.trim() : ''
        if (!text) return error('text is required', 400)
        if (text.length > MAX_MESSAGE_LENGTH) {
          return error(`A message can be at most ${MAX_MESSAGE_LENGTH} characters`, 400)
        }
        return ctx.stream(session, session.frames.length, false, async (send, signal) => {
          await sendMessage(ctx.deps(session), session, text, send, signal)
        })
      })],

    // Writes a Message for the player to edit or send; nothing is saved.
    ['POST', path('suggest'), (req, p) =>
      withRoleplay(p.id!, 'suggest', async (session) => {
        if (!session.frames.length) return error('The scene has not begun yet', 409)
        const body = await readJson(req) as { draft?: unknown } | undefined
        const draft = typeof body?.draft === 'string' ? body.draft : ''
        if (draft.length > MAX_MESSAGE_LENGTH) {
          return error(`A message can be at most ${MAX_MESSAGE_LENGTH} characters`, 400)
        }
        return ctx.stream(session, null, false, async (send, signal) => {
          await suggestMessage(ctx.suggestModel(session), session, draft, send, signal)
        })
      })],

    ['DELETE', path('frames/:index'), (_req, p) =>
      withRoleplay(p.id!, 'undo', async (session) => {
        const index = Number(p.index)
        if (!Number.isInteger(index)) return error('Frame index must be a number', 400)
        const undone = await undoLatestExchange(ctx.deps(session).store, session, index)
        ctx.jobs.cancelWhere(session.id, (job) => job.frameIndex === index)
        return json(undone)
      })],

    ['PUT', path('look'), (req, p) =>
      withRoleplay(p.id!, 'edit', async (session) => {
        if (!session.look) return error('This Roleplay has no Look yet', 409)
        return json(await setLook(ctx.deps(session).store, session, await readJson(req)))
      })],

    // The Character's voice in words; a new description needs a new voice (the `voice` job).
    ['PUT', path('voice'), (req, p) =>
      withRoleplay(p.id!, 'edit', async (session) => {
        if (!session.cast) return error('This Roleplay has not been set up', 409)
        return json(
          await setVoiceDescription(ctx.deps(session).store, session, await readJson(req)),
        )
      })],

    ['PUT', path('cast'), (req, p) =>
      withRoleplay(p.id!, 'edit', async (session) => {
        if (!session.cast) return error('This Roleplay has not been set up', 409)
        return json(await setCast(ctx.deps(session).store, session, await readJson(req)))
      })],
  ]
}
