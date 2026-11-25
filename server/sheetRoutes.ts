/**
 * A Storyboard's or a Roleplay's reference sheets, by Subject (`sheets.ts`): Redo one with the
 * next seed, or tick it (its face repainted from it) or untick it. Each is refused once the story
 * has begun; the sheets to make are queued after (`queueSheets`). The sheets themselves are made
 * from the Look, as it's written and edited.
 */
import { error, json, readJson, type Route } from './http.ts'
import type { AppContext } from './appContext.ts'
import type { Session } from '../shared/session.ts'
import { redoSheet, tickSheet, type WithSheets } from './sheets.ts'

export function sheetRoutes(ctx: AppContext): Route[] {
  const { deps, locked, featureOff, queueSheets } = ctx
  const path = (rest = '') =>
    new URLPattern({ pathname: `/api/sessions/:id/sheets/:subject${rest}` })

  /** Runs `change` on a Session with sheets, then queues what's to make, answering the Session. */
  const withSheets = (
    id: string,
    change: (session: WithSheets) => Promise<unknown>,
  ) =>
    locked(id, 'edit', async (session: Session) => {
      if (session.kind === 'chain') return error('A Chain has no sheets', 409)
      const off = await featureOff('sheets')
      if (off) return off
      await change(session)
      await queueSheets(session.id)
      return json(await deps.sessions.load(session.id))
    })

  return [
    // Made again with the next seed, its old picture gone.
    [
      'POST',
      path('/redo'),
      (_req, p) =>
        withSheets(
          p.id!,
          (session) => redoSheet(deps.sessions, session, decodeURIComponent(p.subject!)),
        ),
    ],

    // `{ ticked }`: unticked, its sheet isn't made (one queued is cancelled) and its face is left
    // as rendered; ticked again, it's made if it wasn't.
    ['PUT', path(), async (req, p) => {
      const body = await readJson(req) as { ticked?: unknown } | undefined
      if (typeof body?.ticked !== 'boolean') return error('ticked must be true or false', 400)
      const ticked = body.ticked
      return await withSheets(
        p.id!,
        (session) => tickSheet(deps.sessions, session, decodeURIComponent(p.subject!), ticked),
      )
    }],
  ]
}
