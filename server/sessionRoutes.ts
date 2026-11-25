/**
 * A Session's own routes, whatever its kind: starting, listing, loading and deleting it, its Text
 * Model, its files, and what more than one kind does by its kind (deleting a Frame, Restart, a hand
 * edit).
 */
import { extname, join } from '@std/path'
import { serveFile } from '@std/http/file-server'
import { error, json, readJson, type Route } from './http.ts'
import { servedFile } from './sessionParts.ts'
import { crossedLimit } from './limits.ts'
import { scenarioFrom, scenarioText } from './scenario.ts'
import type { Scenario } from '../shared/scenario.ts'
import { excerpt } from './session.ts'
import {
  type Loaded,
  type Session,
  SESSION_TITLE_LENGTH,
  type SessionSummary,
} from '../shared/session.ts'
import { MAX_SEED, sessionSettingsOf, SIZE_PRESETS } from './settings.ts'
import { roleplayExcerpt } from './roleplay/prompt.ts'
import { restartRoleplay } from './roleplay/engine.ts'
import type { Job } from '../shared/jobs.ts'
import { removeSession, updateSession } from './update.ts'
import { homeImage } from './pictures.ts'
import { frameName } from './frames.ts'
import { deleteFrame, setFramePrompt } from './chain/frames.ts'
import {
  FRAME_COUNT,
  removeBeat,
  restartStoryboard,
  setBeat,
  setFrameBody,
} from './storyboard/storyboard.ts'
import { Refusal } from './refusal.ts'
import {
  type AppContext,
  frameIndexOf,
  isStringList,
  needsChain,
  needsStoryboard,
  startingTitle,
} from './appContext.ts'

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.ply': 'application/octet-stream',
  '.mp4': 'video/mp4',
}

const MAX_BRIEF_LENGTH = 4000

/** Refuses a typed Brief that's too long, or crosses a Limit. */
export function checkBrief(brief: string): void {
  if (brief.length > MAX_BRIEF_LENGTH) {
    throw new Refusal(`A Brief can be at most ${MAX_BRIEF_LENGTH} characters`, 400)
  }
  const limit = crossedLimit(brief)?.message
  if (limit) throw new Refusal(`The Brief crosses a limit: ${limit}`, 422)
}

/** A Scenario the Scenario page sent, checked and within the Limits; refused if it isn't. */
export function sentScenario(value: unknown): Scenario {
  let scenario: Scenario
  try {
    scenario = scenarioFrom(value)
  } catch (err) {
    throw new Refusal(`The Scenario isn't complete: ${(err as Error).message}`, 400)
  }
  const limit = crossedLimit(scenarioText(scenario))?.message
  if (limit) throw new Refusal(`The Scenario crosses a limit: ${limit}`, 422)
  return scenario
}

export function sessionRoutes(ctx: AppContext): Route[] {
  const { deps, jobs, active, previews, newSessionId, randomSeed, locked, loadSession } = ctx

  return [
    ['POST', new URLPattern({ pathname: '/api/sessions' }), async (req) => {
      const body = await readJson(req) as
        | {
          kind?: unknown
          scenarioId?: unknown
          brief?: unknown
          scenario?: unknown
          frameCount?: unknown
          seed?: unknown
          sheets?: unknown
        }
        | undefined
      const kind = body?.kind ?? 'chain'
      if (kind !== 'chain' && kind !== 'storyboard' && kind !== 'roleplay') {
        return error('kind must be "chain", "storyboard" or "roleplay"', 400)
      }
      const scenarioId = typeof body?.scenarioId === 'string' ? body.scenarioId : null
      const brief = typeof body?.brief === 'string' && body.brief.trim() ? body.brief.trim() : null
      if (!scenarioId === !brief) return error('Give either a scenarioId or a brief', 400)
      if (brief) checkBrief(brief)
      // The Scenario as the Scenario page left it, or else the file as it is (a replay's).
      let scenario: Scenario | undefined
      if (body?.scenario !== undefined) {
        const sent = sentScenario(body.scenario)
        scenario = { ...sent, id: scenarioId ?? '' }
      } else if (scenarioId) {
        scenario = await deps.scenarios.get(scenarioId)
        if (!scenario) return error('Scenario not found', 404)
      }
      let frameCount = FRAME_COUNT.default
      if (kind === 'storyboard' && body?.frameCount !== undefined) {
        frameCount = Number(body.frameCount)
        if (
          !Number.isInteger(frameCount) || frameCount < FRAME_COUNT.min ||
          frameCount > FRAME_COUNT.max
        ) {
          return error(`frameCount must be ${FRAME_COUNT.min}–${FRAME_COUNT.max}`, 400)
        }
      }
      // A seed of its own (a replay's, server/replay/), or else Settings'.
      const seed = body?.seed
      if (
        seed !== undefined &&
        (!Number.isInteger(seed) || (seed as number) < 0 || (seed as number) > MAX_SEED)
      ) {
        return error(`seed must be an integer from 0 to ${MAX_SEED}`, 400)
      }
      const settings = await deps.settings.load()
      if (!settings.textModel) return error('Choose a Text Model in Settings first', 400)
      // Reference sheets, as asked when it starts, or else as Settings have them; a Chain has no
      // Look to make them from.
      if (body?.sheets !== undefined && typeof body.sheets !== 'boolean') {
        return error('sheets must be true or false', 400)
      }
      if (body?.sheets === true && kind === 'chain') return error('A Chain has no sheets', 400)
      const sheetsOff = kind === 'chain' || await ctx.featureOff('sheets')
      if (body?.sheets === true && sheetsOff) return sheetsOff as Response
      const sheets = body?.sheets !== false && !sheetsOff
      const base = {
        id: newSessionId(),
        title: startingTitle({ scenario, brief, scenarioId }),
        brief,
        scenarioId,
        ...scenario && { scenario },
        settings: sessionSettingsOf(settings, sheets),
        seed: (seed as number | undefined) ??
          (settings.seedMode === 'fixed' ? settings.seed : randomSeed()),
        createdAt: new Date().toISOString(),
      }
      const session: Session = kind === 'chain'
        ? { ...base, kind, frames: [] }
        : kind === 'roleplay'
        ? {
          ...base,
          kind,
          cast: null,
          look: null,
          lookBehindCast: false,
          sheets: [],
          cues: [],
          frames: [],
        }
        : { ...base, kind, frameCount, look: null, sheets: [], frames: [] }
      await deps.sessions.save(session)
      return json(session, 201)
    }],

    ['GET', new URLPattern({ pathname: '/api/sessions' }), async () => {
      const sessions = await deps.sessions.list()
      const summaries = sessions.map((s): SessionSummary => {
        const updatedAt = s.frames.reduce(
          (latest, f) => f.createdAt > latest ? f.createdAt : latest,
          s.createdAt,
        )
        return {
          id: s.id,
          kind: s.kind,
          scenarioId: s.scenarioId,
          title: s.title,
          frames: s.frames.length,
          thumbnail: homeImage(s),
          // Shown in place of a picture until there is one: a Roleplay's latest line, a Chain's
          // latest Narration, a Storyboard's first Beat.
          excerpt: s.kind === 'roleplay'
            ? roleplayExcerpt(s)
            : excerpt(s.kind === 'chain' ? s.frames.at(-1)?.narration : s.frames[0]?.beat),
          createdAt: s.createdAt,
          updatedAt,
          activity: active.get(s.id)?.phase ?? jobs.activity(s.id) ?? null,
        }
      })
      summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      return json(summaries)
    }],

    [
      'DELETE',
      new URLPattern({ pathname: '/api/sessions/:id' }),
      (_req, p) =>
        locked(p.id!, 'delete', async (session) => {
          jobs.cancelWhere(session.id, () => true)
          await removeSession(deps.sessions, session.id)
          return new Response(null, { status: 204 })
        }),
    ],

    ['GET', new URLPattern({ pathname: '/api/sessions/:id' }), async (_req, p) => {
      const session = await loadSession(p.id!)
      // `activity` lets a screen that didn't start the running work (another tab) show it.
      const work = active.get(session.id)
      // The size its pictures render at (as Settings are now), so a screen can shape the frame
      // before the first arrives.
      const { size } = await deps.settings.load()
      const { width, height } = SIZE_PRESETS.find((p) => p.id === size) ?? SIZE_PRESETS[0]
      return json(
        {
          ...session,
          activity: work?.phase ?? null,
          activeFrame: work?.frameIndex ?? null,
          imageSize: { width, height },
        } satisfies Session & Loaded,
      )
    }],

    // Switches the Session's Text Model: `{ textModel }`, by name (ADR 0037). Its Thinking stays as it
    // started. What's writing now finishes on the old one, as do jobs queued before (`Job.text`).
    ['PUT', new URLPattern({ pathname: '/api/sessions/:id/text-model' }), async (req, p) => {
      const body = await readJson(req) as { textModel?: unknown } | undefined
      if (typeof body?.textModel !== 'string' || !body.textModel.trim()) {
        return error('textModel must be a model name', 400)
      }
      const session = await loadSession(p.id!)
      const textModel = body.textModel.trim()
      return json(
        await updateSession(
          deps.sessions,
          session.id,
          session.kind,
          (latest: Session) =>
            latest.settings.textModel === textModel
              ? latest
              : { ...latest, settings: { ...latest.settings, textModel } } as Session,
        ),
      )
    }],

    // Renames the Session: `{ title }`. Allowed while work runs on it, as it changes nothing else,
    // and saved over the latest, so a Frame written meanwhile is kept.
    ['PATCH', new URLPattern({ pathname: '/api/sessions/:id' }), async (req, p) => {
      const body = await readJson(req) as { title?: unknown } | undefined
      const title = typeof body?.title === 'string' ? body.title.trim() : ''
      if (!title) return error('title must be some text', 400)
      if (title.length > SESSION_TITLE_LENGTH) {
        return error(`title must be at most ${SESSION_TITLE_LENGTH} characters`, 400)
      }
      const session = await loadSession(p.id!)
      return json(
        await updateSession(
          deps.sessions,
          session.id,
          session.kind,
          (latest: Session) => latest.title === title ? latest : { ...latest, title },
        ),
      )
    }],

    ['POST', new URLPattern({ pathname: '/api/sessions/:id/cancel' }), (_req, p) => {
      active.get(p.id!)?.controller.abort(new Error('Cancelled by player'))
      return Promise.resolve(new Response(null, { status: 204 }))
    }],

    // Deletes a Chain's Frame, any but the Opening Frame, or a Storyboard's Beat while it's planned:
    // `{ frames, createdAt }`, how many Frames it had and when this one was made, so a repeated
    // request can't delete the one after it. A Chain's is refused while a job runs on it; jobs on
    // later Frames, queued or running, follow them as they're numbered down.
    ['POST', new URLPattern({ pathname: '/api/sessions/:id/frames/:index/delete' }), (req, p) => {
      const index = Number(p.index)
      if (!Number.isInteger(index)) {
        return Promise.resolve(error('Frame index must be a number', 400))
      }
      return locked(p.id!, 'delete-frame', async (session) => {
        if (!needsChain(session) && !needsStoryboard(session)) {
          return error('Only a Chain or a Storyboard deletes Frames this way', 409)
        }
        const body = await readJson(req) as { frames?: unknown; createdAt?: unknown } | undefined
        if (typeof body?.createdAt !== 'string' || !Number.isInteger(body.frames)) {
          return error('frames (a count) and createdAt are required', 400)
        }
        const seen = { frames: body.frames as number, createdAt: body.createdAt }
        // A Storyboard's Beat, before its Frames are written: nothing is rendered or queued yet.
        if (needsStoryboard(session)) {
          return json(await removeBeat({ store: deps.sessions }, session, index, seen))
        }
        const running = jobs.list(session.id)
          .find((j) => j.status === 'running' && j.frameIndex === index)
        if (running) {
          return error(
            `${frameName(index)} has a job running: wait for it, or cancel it, then delete`,
            409,
          )
        }
        return json(
          await jobs.holding(session.id, () =>
            jobs.frames(session.id, async () => {
              const updated = await deleteFrame(deps.sessions, session, index, seen)
              jobs.frameDeleted(session.id, index)
              return updated
            })),
        )
      })
    }],

    // A Storyboard back to the plan: every Frame's sentences and pictures go, so the Look and
    // Beats can be edited again. A Roleplay back to its Cast: every exchange goes, the opening too.
    // Their jobs are cancelled (all but a Roleplay's voice, which stays), and it waits for a render
    // running to end.
    [
      'POST',
      new URLPattern({ pathname: '/api/sessions/:id/restart' }),
      async (_req, p) => {
        // Only these kinds' jobs are cancelled, so it's checked before taking the lock.
        const found = await deps.sessions.load(p.id!)
        if (found?.kind !== 'storyboard' && found?.kind !== 'roleplay') {
          return error(
            found ? 'Only a Storyboard or a Roleplay restarts' : 'Session not found',
            found ? 409 : 404,
          )
        }
        // A Roleplay's voice, Look and sheets stay, as its Cast does.
        const cancelled = (job: Job) =>
          found.kind === 'storyboard' ||
          (job.kind !== 'voice' && job.kind !== 'look' && job.kind !== 'sheet')
        jobs.cancelWhere(p.id!, cancelled)
        return jobs.betweenRenders(p.id!, () =>
          locked(p.id!, 'edit', async (session) => {
            if (session.kind === 'roleplay') {
              if (!session.frames.length) return error('The scene has not begun yet', 409)
              jobs.cancelWhere(session.id, cancelled)
              await restartRoleplay(deps.sessions, session)
              // Back in its Cast review, its sheets can change again.
              await ctx.queueSheets(session.id)
              return json(await deps.sessions.load(session.id))
            }
            if (!needsStoryboard(session) || !session.look) {
              return error('Only a planned Storyboard restarts', 409)
            }
            jobs.cancelWhere(session.id, cancelled)
            await restartStoryboard({ store: deps.sessions }, session)
            // Back in its plan review, its sheets can change again: those not made are queued.
            await ctx.queueSheets(session.id)
            return json(await deps.sessions.load(session.id))
          }))
      },
    ],

    // A Frame edited by hand: a Storyboard's `{ body, shown }` (`{ beat, shown }`, its Beat, before
    // its Frames are written), or a Chain's `{ prompt }`, its
    // Image Prompt, which marks its pictures out of date.
    [
      'PUT',
      new URLPattern({ pathname: '/api/sessions/:id/frames/:index' }),
      (req, p) =>
        locked(p.id!, 'edit', async (session) => {
          if (!needsChain(session) && !needsStoryboard(session)) {
            return error('A Roleplay edits its Frames its own way', 409)
          }
          const index = frameIndexOf(session, p.index)
          if (needsChain(session)) {
            const body = await readJson(req) as { prompt?: unknown } | undefined
            if (typeof body?.prompt !== 'string') return error('prompt is required', 400)
            return json(await setFramePrompt(deps.sessions, session, index, body.prompt))
          }
          const body = await readJson(req) as
            | { body?: unknown; beat?: unknown; shown?: unknown }
            | undefined
          if (body?.shown !== undefined && !isStringList(body.shown)) {
            return error('shown must be a list of names', 400)
          }
          // Before the Frames are written, its Beat; after, its sentences.
          if (typeof body?.beat === 'string') {
            return json(
              await setBeat({ store: deps.sessions }, session, index, body.beat, body.shown),
            )
          }
          if (typeof body?.body !== 'string') return error('body or beat is required', 400)
          return json(
            await setFrameBody({ store: deps.sessions }, session, index, body.body, body.shown),
          )
        }),
    ],

    // The picture forming: the latest preview of the Session's render, while there is one and
    // Settings show it. The browser asks again as the step count moves (`?step=`), so never cached.
    ['GET', new URLPattern({ pathname: '/api/sessions/:id/preview' }), async (_req, p) => {
      const jpeg = previews.get(p.id!)
      if (!jpeg || !(await deps.settings.load()).previews) return error('No preview', 404)
      return new Response(jpeg, {
        headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
      })
    }],

    // Served by byte ranges where asked: Safari won't seek in a video (a clip) without them.
    ['GET', new URLPattern({ pathname: '/api/sessions/:id/images/:file' }), async (req, p) => {
      if (!servedFile(p.file!)) return error('Not found', 404)
      const res = await serveFile(req, join(deps.sessions.dir(p.id!), p.file!))
      if (res.status === 404) return error('Not found', 404)
      res.headers.set('Content-Type', CONTENT_TYPES[extname(p.file!)])
      res.headers.set('Cache-Control', 'private, max-age=31536000, immutable')
      return res
    }],
  ]
}
