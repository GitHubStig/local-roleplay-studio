import { error, json, readJson, type Route } from '../http.ts'
import type { StreamEvent } from '../app.ts'
import type { Scenario } from '../scenario.ts'
import type { Session, SessionStore } from '../session.ts'
import type { SessionJobs } from '../jobs.ts'
import {
  beginRoleplay,
  type RoleplayDeps,
  RoleplayError,
  type RoleplayEvent,
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
import { logCallsUnder } from '../calls.ts'
import { setVoiceDescription, VoiceError } from './voice.ts'
import type { RoleplayFrame, RoleplaySession } from './types.ts'

/**
 * What follows a Reply, as the player's switches ask (in their browser): its line spoken, as
 * autoplay plays it, and its picture rendered. Its picture (its Image Prompt) is written unless
 * `picture` is false: left to be asked for, as tests and the replay tool may.
 */
export interface AfterReply {
  speak: boolean
  picture: boolean
  render: boolean
}

/** What a Message or the opening was sent with to follow it. */
const afterReplyOf = (body: unknown): AfterReply => {
  const b = body as { speak?: unknown; picture?: unknown; render?: unknown } | undefined
  return { speak: b?.speak === true, picture: b?.picture !== false, render: b?.render === true }
}

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
  scenarioFor(session: Session): Scenario | Response
  deps(session: Session): RoleplayDeps
  /** The model Suggest writes with: the Session's Text Model, Thinking off. */
  suggestModel(session: Session): RoleplayModel
  /**
   * Queues what follows a Reply as it's saved, as `after` asks, so the page that hears of it finds
   * it in the queue: its line spoken, its picture, its render, in that order. Resolves, once it
   * knows where each runs, with what queues them for the saved Reply's Frame.
   */
  queuesAfterReply(
    session: RoleplaySession,
    after: AfterReply,
  ): Promise<(frame: RoleplayFrame) => void>
  /** Background work (pictures, renders, upscales…), to cancel what an Undo leaves behind. */
  jobs: SessionJobs
  store: SessionStore
}

/** `send`, queueing what follows a Reply (`queue`) as it's saved, before the page hears of it. */
const queueing =
  (send: (event: StreamEvent) => void, queue: (frame: RoleplayFrame) => void) =>
  (event: RoleplayEvent) => {
    if (event.type === 'replied') queue(event.frame)
    send(event)
  }

/** The routes only a Roleplay has, under `/api/sessions/:id/roleplay/`. */
export function roleplayRoutes(ctx: RoleplayRouteContext): Route[] {
  const path = (rest: string) => new URLPattern({ pathname: `/api/sessions/:id/roleplay/${rest}` })

  /** Runs `handle` on a Roleplay, turning the engine's refusals into responses. */
  const withRoleplay = (
    id: string,
    kind: RoleplayLockKind,
    handle: (session: RoleplaySession) => Response | Promise<Response>,
  ) =>
    ctx.locked(id, kind, async (session) => {
      if (session.kind !== 'roleplay') return error('Only a Roleplay has this', 409)
      try {
        return await handle(session)
      } catch (err) {
        if (err instanceof RoleplayError) return error(err.message, 409)
        if (err instanceof RoleplayLimitError) return error(err.message, 422)
        // A hand-edited Cast that's incomplete.
        if (err instanceof CastError || err instanceof VoiceError) return error(err.message, 400)
        throw err
      }
    })

  return [
    ['POST', path('cast'), (_req, p) =>
      withRoleplay(p.id!, 'setup', (session) => {
        if (session.frames.length) return error('The scene has already begun', 409)
        const scenario = ctx.scenarioFor(session)
        if (scenario instanceof Response) return scenario
        // A Roleplay whose first Cast was never written never started, like a Chain's Opening
        // Frame; a failed rewrite keeps the Cast it had.
        return ctx.stream(session, null, !session.cast, async (send, signal) => {
          await writeCast(ctx.deps(session), session, scenario, send, signal)
        })
      })],

    ['POST', path('begin'), (req, p) =>
      withRoleplay(p.id!, 'frame', async (session) => {
        if (!session.cast) return error('This Roleplay has no Cast yet', 409)
        if (session.frames.length) return error('The scene has already begun', 409)
        const queue = await ctx.queuesAfterReply(session, afterReplyOf(await readJson(req)))
        return await ctx.stream(session, 0, false, async (send, signal) => {
          await beginRoleplay(ctx.deps(session), session, queueing(send, queue), signal)
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
        const queue = await ctx.queuesAfterReply(session, afterReplyOf(body))
        return ctx.stream(session, session.frames.length, false, async (send, signal) => {
          await sendMessage(ctx.deps(session), session, text, queueing(send, queue), signal)
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
          // Logged with the Frame the suggested Message would start.
          await logCallsUnder(
            session.frames.length,
            () => suggestMessage(ctx.suggestModel(session), session, draft, send, signal),
          )
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

    // Saved between renders, so the next one queued renders it.
    [
      'PUT',
      path('look'),
      (req, p) =>
        ctx.jobs.betweenRenders(p.id!, () =>
          withRoleplay(p.id!, 'edit', async (session) => {
            if (!session.look) return error('This Roleplay has no Look yet', 409)
            return json(await setLook(ctx.deps(session).store, session, await readJson(req)))
          })),
    ],

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
