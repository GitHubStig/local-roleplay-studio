import { error, json, readJson, requiredText, type Route } from '../http.ts'
import type { StreamEvent } from '../app.ts'
import type { Scenario } from '../../shared/scenario.ts'
import type { SessionStore } from '../session.ts'
import type { Session } from '../../shared/session.ts'
import type { SessionJobs } from '../jobs.ts'
import {
  beginRoleplay,
  type RoleplayDeps,
  sendMessage,
  setCast,
  setLook,
  undoExchanges,
  writeCast,
} from './engine.ts'
import type { RoleplayEvent } from '../../shared/events.ts'
import type { RoleplayModel } from './model.ts'
import { steerRefusal } from './music/director.ts'
import { updateSession } from './update.ts'
import { suggestMessage } from './suggest.ts'
import { logCallsUnder } from '../calls.ts'
import { undoAsked } from '../appContext.ts'
import { setVoiceDescription } from './voice.ts'
import type { RoleplayFrame, RoleplaySession } from '../../shared/roleplay.ts'
import type { Settings } from '../../shared/settings.ts'
import { setMusicSettings, setScore, writeScore } from './music/score.ts'

/**
 * What follows a Reply, as the player's switches ask (in their browser): its line spoken, as
 * autoplay plays it, its music directed, and its picture rendered. Its picture (its Image Prompt) is written unless
 * `picture` is false: left to be asked for, as tests and the replay tool may.
 */
export interface AfterReply {
  speak: boolean
  picture: boolean
  render: boolean
  /** Its music directed (Score as you play), while Music is on. */
  direct: boolean
}

/** What a Message or the opening was sent with to follow it. */
const afterReplyOf = (body: unknown): AfterReply => {
  const b = body as
    | { speak?: unknown; picture?: unknown; render?: unknown; direct?: unknown }
    | undefined
  return {
    speak: b?.speak === true,
    picture: b?.picture !== false,
    render: b?.render === true,
    direct: b?.direct === true,
  }
}

/** A player's message can be at most this long. */
const MAX_MESSAGE_LENGTH = 4000

type RoleplayLockKind = 'setup' | 'frame' | 'undo' | 'edit' | 'render' | 'suggest' | 'score'

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
  scenarioFor(session: Session): Scenario
  deps(session: Session): RoleplayDeps
  /** The model Suggest writes with: the Session's Text Model, Thinking off. */
  suggestModel(session: Session): RoleplayModel
  /** Settings as they are now. */
  settings(): Promise<Settings>
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
      return await handle(session)
    })

  /** Why the music's routes are refused: Music is switched off in Settings. */
  const musicOff = async () =>
    (await ctx.settings()).music ? null : error('Music is switched off in Settings', 409)

  return [
    ['POST', path('cast'), (_req, p) =>
      withRoleplay(p.id!, 'setup', (session) => {
        if (session.frames.length) return error('The scene has already begun', 409)
        const scenario = ctx.scenarioFor(session)
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
        const text = requiredText(body, 'text')
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

    // Undo, from Frame `:index` on.
    ['DELETE', path('frames/:index'), (req, p) => {
      const { from, latest } = undoAsked(req, p.index)
      return withRoleplay(p.id!, 'undo', async (session) => {
        const undone = await undoExchanges(ctx.deps(session).store, session, from, latest)
        ctx.jobs.cancelWhere(session.id, (job) => job.frameIndex >= from)
        return json(undone)
      })
    }],

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

    // The music's identity, written (or written again) from the Cast, the Brief and the tastes.
    ['POST', path('score'), (_req, p) =>
      withRoleplay(p.id!, 'score', async (session) => {
        const off = await musicOff()
        if (off) return off
        if (!session.cast) return error('This Roleplay has not been set up', 409)
        const scenario = ctx.scenarioFor(session)
        const model = ctx.deps(session).roleplayModel
        return ctx.stream(session, null, false, async (send, signal) => {
          await writeScore(
            { store: ctx.store, model },
            session,
            scenario,
            send,
            signal,
          )
        })
      })],

    ['PUT', path('score'), (req, p) =>
      withRoleplay(p.id!, 'edit', async (session) => {
        const off = await musicOff()
        if (off) return off
        if (!session.score) return error('This Roleplay has no Score yet', 409)
        return json(await setScore(ctx.store, session, await readJson(req)))
      })],

    // What the player asks of a Cue, kept on it; a `steer` job then writes it again.
    ['PUT', path('cues/:cue/steer'), (req, p) =>
      withRoleplay(p.id!, 'edit', async (session) => {
        const off = await musicOff()
        if (off) return off
        const body = await readJson(req) as { steer?: unknown } | undefined
        const steer = typeof body?.steer === 'string' ? body.steer.trim() : ''
        const refused = steerRefusal(steer)
        if (refused) return error(refused, 400)
        if (!session.cues.some((c) => c.id === p.cue && c.values)) {
          return error('No such Cue', 404)
        }
        return json(
          await updateSession(ctx.store, session.id, (latest) => ({
            ...latest,
            cues: latest.cues.map((c) => c.id === p.cue ? { ...c, steer } : c),
          })),
        )
      })],

    // The Roleplay's own Behaviour and Music taste.
    ['PUT', path('music'), (req, p) =>
      withRoleplay(p.id!, 'edit', async (session) => {
        const off = await musicOff()
        if (off) return off
        return json(await setMusicSettings(ctx.store, session, await readJson(req)))
      })],

    ['PUT', path('cast'), (req, p) =>
      withRoleplay(p.id!, 'edit', async (session) => {
        if (!session.cast) return error('This Roleplay has not been set up', 409)
        return json(await setCast(ctx.deps(session).store, session, await readJson(req)))
      })],
  ]
}
