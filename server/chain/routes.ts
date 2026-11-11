/** A Chain's routes: a Frame from an Action, Undo, and a new Chain from a Storyboard's Frames. */
import { error, json, readJson, requiredText, type Route } from '../http.ts'
import { imageChoiceOf } from '../jobs.ts'
import { logCallsUnder } from '../calls.ts'
import { chainFromStoryboard } from './fromStoryboard.ts'
import { machineOf } from '../machine.ts'
import { runChainFrame, undoFrames } from './frames.ts'
import type { FrameEvent } from '../../shared/events.ts'
import {
  type AppContext,
  frameIndexOf,
  needsChain,
  needsStoryboard,
  scenarioFor,
  undoAsked,
} from '../appContext.ts'

export function chainRoutes(ctx: AppContext): Route[] {
  const { deps, jobs, newSessionId, locked, stream, frameDeps, featureOff, jobBackendOf } = ctx

  return [
    [
      'POST',
      new URLPattern({ pathname: '/api/sessions/:id/frames' }),
      (req, p) =>
        locked(p.id!, 'frame', async (session) => {
          if (!needsChain(session)) return error('Only a Chain makes Frames from Actions', 409)
          // Rendered as it's made only while the Chain says so and pictures are on.
          const body = await readJson(req) as { action?: unknown; render?: unknown } | undefined
          // Rendered as it's made unless this browser's switch says not (sent as `render`), while
          // pictures are on.
          const render = body?.render !== false && !(await featureOff('images'))
          const opening = session.frames.length === 0
          const action = opening ? null : requiredText(body, 'action')
          const scenario = scenarioFor(session)
          // Its picture is a render job, queued as the Frame is saved, so the page that hears of
          // the Frame finds its render in the queue.
          const machine = render ? machineOf(await jobBackendOf(session, 'render')) : undefined
          return stream(session, null, opening, async (send, signal) => {
            const sendQueueing = (event: FrameEvent) => {
              if (event.type === 'committed' && machine) {
                jobs.enqueue(
                  session.id,
                  'render',
                  event.frame.index,
                  machine,
                  imageChoiceOf(session),
                )
              }
              send(event)
            }
            // The Frame being made, though the stream isn't one Frame's until it's saved.
            await logCallsUnder(
              session.frames.length,
              () =>
                runChainFrame(frameDeps(session), session, scenario, action, sendQueueing, signal),
            )
          })
        }),
    ],

    // Undo, from Frame `:index` on.
    ['DELETE', new URLPattern({ pathname: '/api/sessions/:id/frames/:index' }), (req, p) => {
      const { from, latest } = undoAsked(req, p.index)
      return locked(p.id!, 'undo', async (session) => {
        if (!needsChain(session)) return error('Only a Chain has Undo', 409)
        const undone = await undoFrames(deps.sessions, session, from, latest)
        jobs.cancelWhere(session.id, (job) => job.frameIndex >= from)
        return json(undone)
      })
    }],

    // A new Chain from a Storyboard's Frames up to `index`, to carry on from that Frame by
    // Actions; the Storyboard stays as it is. Made between renders, as it copies their pictures.
    [
      'POST',
      new URLPattern({ pathname: '/api/sessions/:id/frames/:index/chain' }),
      (_req, p) =>
        jobs.betweenRenders(p.id!, () =>
          locked(p.id!, 'copy', async (session) => {
            if (!needsStoryboard(session)) {
              return error('Only a Storyboard is made into a Chain', 409)
            }
            const index = frameIndexOf(session, p.index)
            const chain = await chainFromStoryboard(deps.sessions, session, index, {
              id: newSessionId(),
              createdAt: new Date().toISOString(),
            })
            return json(chain, 201)
          })),
    ],
  ]
}
