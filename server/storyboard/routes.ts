/** A Storyboard's routes: its plan, writing its Frames, editing one by Action, its Beats and Look. */
import { error, json, readJson, type Route } from '../http.ts'
import { GoneError } from '../update.ts'
import {
  editFrameByAction,
  insertBeat,
  planStoryboard,
  reorderBeats,
  setLook,
  writeStoryboard,
} from './storyboard.ts'
import type { AppContext } from '../appContext.ts'
import { frameIndexOf, isStringList, needsStoryboard } from '../appContext.ts'

export function storyboardRoutes(ctx: AppContext): Route[] {
  const { deps, locked, stream, scenarioFor, frameDeps } = ctx

  return [
    [
      'POST',
      new URLPattern({ pathname: '/api/sessions/:id/plan' }),
      (_req, p) =>
        locked(p.id!, 'plan', (session) => {
          if (!needsStoryboard(session)) return error('Only a Storyboard is planned', 409)
          if (session.frames.length > 0) return error('This Storyboard is already planned', 409)
          const scenario = scenarioFor(session)
          if (scenario instanceof Response) return scenario
          // A Storyboard that never got planned never started, like a Chain's Opening Frame.
          return stream(session, null, true, async (send, signal) => {
            await planStoryboard(frameDeps(session), session, scenario, send, signal)
          })
        }),
    ],

    // Writes the Frames of a reviewed plan, a call per Frame, each saved as it comes: a failure or
    // Cancel keeps those written, and writing again carries on from the next.
    [
      'POST',
      new URLPattern({ pathname: '/api/sessions/:id/write' }),
      (_req, p) =>
        locked(p.id!, 'write', (session) => {
          if (!needsStoryboard(session)) return error('Only a Storyboard writes its Frames', 409)
          const scenario = scenarioFor(session)
          if (scenario instanceof Response) return scenario
          // Refused up front, before the stream: nothing to write, or not planned yet.
          if (!session.look || session.frames.every((f) => f.body)) {
            return error(
              session.look ? 'Every Frame is written already' : 'Plan the Storyboard first',
              409,
            )
          }
          return stream(session, null, false, async (send, signal) => {
            await writeStoryboard(frameDeps(session), session, scenario, send, signal)
          })
        }),
    ],

    [
      'POST',
      new URLPattern({ pathname: '/api/sessions/:id/frames/:index/edit' }),
      (req, p) =>
        locked(p.id!, 'edit', async (session) => {
          if (!needsStoryboard(session)) {
            return error('Only a Storyboard edits Frames in place', 409)
          }
          const index = frameIndexOf(session, p.index)
          if (index instanceof Response) {
            return index
          }
          const body = await readJson(req) as { action?: unknown } | undefined
          if (typeof body?.action !== 'string' || !body.action.trim()) {
            return error('action is required', 400)
          }
          const action = body.action.trim()
          const scenario = scenarioFor(session)
          if (scenario instanceof Response) return scenario
          return stream(session, index, false, async (send, signal) => {
            const result = await editFrameByAction(
              frameDeps(session),
              session,
              scenario,
              index,
              action,
              send,
              signal,
            )
            send({ type: 'edited', ...result })
          })
        }),
    ],

    // A Beat added to a Storyboard's plan by hand, `{ at, beat, shown }`, before its Frames are
    // written: the Frames from `at` on move up one.
    [
      'POST',
      new URLPattern({ pathname: '/api/sessions/:id/beats' }),
      (req, p) =>
        locked(p.id!, 'edit', async (session) => {
          if (!needsStoryboard(session)) return error('Only a Storyboard has Beats', 409)
          const body = await readJson(req) as
            | { at?: unknown; beat?: unknown; shown?: unknown }
            | undefined
          if (typeof body?.beat !== 'string' || !body.beat.trim()) {
            return error('beat is required', 400)
          }
          const at = body.at
          if (
            typeof at !== 'number' || !Number.isInteger(at) || at < 0 || at > session.frames.length
          ) {
            return error(`at must be 0 to ${session.frames.length}`, 400)
          }
          if (body.shown !== undefined && !isStringList(body.shown)) {
            return error('shown must be a list of names', 400)
          }
          const added = await insertBeat(
            { store: deps.sessions },
            session,
            at,
            body.beat,
            body.shown,
          )
          return json(added, 201)
        }),
    ],

    // A Storyboard's Beats in a new order, before its Frames are written: `{ order, seen }`, the
    // index each had in its new place, and their lines as seen, in the old order (`409` if they've
    // changed since).
    [
      'PUT',
      new URLPattern({ pathname: '/api/sessions/:id/beats/order' }),
      (req, p) =>
        locked(p.id!, 'edit', async (session) => {
          if (!needsStoryboard(session)) return error('Only a Storyboard has Beats', 409)
          const body = await readJson(req) as { order?: unknown; seen?: unknown } | undefined
          const order = body?.order
          const n = session.frames.length
          const permutation = Array.isArray(order) && order.length === n &&
            [...order].sort((a, b) => a - b).every((i, k) => i === k)
          if (!permutation || !isStringList(body?.seen)) {
            return error(
              `order (each of 0 to ${n - 1} once) and seen (the Beats) are required`,
              400,
            )
          }
          try {
            return json(await reorderBeats({ store: deps.sessions }, session, order, body.seen))
          } catch (err) {
            if (err instanceof GoneError) return error(err.message, 409)
            throw err
          }
        }),
    ],

    [
      'PUT',
      new URLPattern({ pathname: '/api/sessions/:id/look' }),
      // Only before the Frames are written (`setLook`), so no render can be using it.
      (req, p) =>
        locked(p.id!, 'edit', async (session) => {
          if (!needsStoryboard(session) || !session.look) {
            return error('Only a planned Storyboard has a Look', 409)
          }
          const body = await readJson(req) as { subjects?: unknown; style?: unknown } | undefined
          const subjects = body?.subjects
          if (
            !Array.isArray(subjects) || typeof body?.style !== 'string' ||
            subjects.some((p) => typeof p?.name !== 'string' || typeof p?.identity !== 'string')
          ) {
            return error('subjects (each with a name and identity) and style are required', 400)
          }
          return json(
            await setLook({ store: deps.sessions }, session, { subjects, style: body.style }),
          )
        }),
    ],
  ]
}
