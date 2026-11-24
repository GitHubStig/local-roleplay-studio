/**
 * The Session manager's routes: what each Session holds and how big it is, opening its folder, and
 * exporting a Session as a zip and importing one (`zip.ts`, `unzip.ts`).
 */
import { dirname, join } from '@std/path'
import { error, fromThisMachine, json, type Route } from '../http.ts'
import { contentsOf, sizeOf } from '../sessionParts.ts'
import type { AppContext } from '../appContext.ts'
import { isOpen } from '../jobs.ts'
import { Refusal } from '../refusal.ts'
import type { SessionContents, SessionSizes } from '../../shared/sessionContents.ts'
import { exportName, type ImportedSession } from '../../shared/sessionZip.ts'
import { EXPORT_ZIP, exportedFiles, zipFiles } from './zip.ts'
import { importZip } from './unzip.ts'
import { freeSpace as osFreeSpace } from './freeSpace.ts'

export function managerRoutes(ctx: AppContext): Route[] {
  const { deps, jobs, active, loadSession } = ctx
  const freeSpace = deps.freeSpace ?? osFreeSpace

  return [
    // Each Session's size on disk: worked out each time it's asked.
    ['GET', new URLPattern({ pathname: '/api/session-sizes' }), async () => {
      const sessions = await deps.sessions.list()
      const sizes = await Promise.all(sessions.map((s) => sizeOf(deps.sessions.dir(s.id))))
      return json(
        Object.fromEntries(sessions.map((s, i) => [s.id, sizes[i]])) satisfies SessionSizes,
      )
    }],

    // What a Session holds, by part (`sessionParts.ts`): its size on disk and its counts.
    ['GET', new URLPattern({ pathname: '/api/sessions/:id/contents' }), async (_req, p) => {
      const session = await loadSession(p.id!)
      return json(
        (await contentsOf(session, deps.sessions.dir(session.id))) satisfies SessionContents,
      )
    }],

    // Shows the Session's folder in the machine's file manager: only for a browser on that
    // machine, which is where it opens.
    ['POST', new URLPattern({ pathname: '/api/sessions/:id/open-folder' }), async (req, p) => {
      if (!deps.openFolder) return error("This machine can't open a folder", 409)
      if (!fromThisMachine(req)) {
        return error("The folder opens on the server's machine, not this one", 409)
      }
      const session = await loadSession(p.id!)
      try {
        await deps.openFolder(deps.sessions.dir(session.id))
      } catch (err) {
        return error((err as Error).message, 500)
      }
      return new Response(null, { status: 204 })
    }],

    // The Session as a zip, written as it downloads. Refused while work runs on it; its lock is
    // held until the download ends or is dropped, so nothing changes mid-zip.
    ['GET', new URLPattern({ pathname: '/api/sessions/:id/export' }), async (_req, p) => {
      const session = await loadSession(p.id!)
      if (active.has(session.id) || jobs.list(session.id).some(isOpen)) {
        return error(
          'Work is running in this Session: wait for it, or cancel it, to export it',
          409,
        )
      }
      const busy = ctx.lock(session.id, 'export')
      if (busy) return busy
      try {
        const dir = deps.sessions.dir(session.id)
        const { stream, done } = zipFiles(dir, await exportedFiles(dir), EXPORT_ZIP)
        done.finally(() => ctx.unlock(session.id))
        const name = exportName(session.title, session.id)
        return new Response(stream, {
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${name}"`,
            'Cache-Control': 'no-store',
          },
        })
      } catch (err) {
        ctx.unlock(session.id)
        throw err
      }
    }],

    // A Session export, sent as the request's body (`application/zip`), unpacked as a new
    // Session. The upload goes to a file beside the Sessions, never into memory, and is removed
    // after, imported or not.
    ['POST', new URLPattern({ pathname: '/api/sessions/import' }), async (req) => {
      if (!req.body) return error('Send the zip as the body', 400)
      const id = ctx.newSessionId()
      const upload = join(dirname(deps.sessions.dir(id)), `.import-${id}.zip`)
      await Deno.mkdir(dirname(upload), { recursive: true })
      const sent = Number(req.headers.get('content-length'))
      const free = await freeSpace(dirname(upload))
      // Twice its size: the zip, and what it unpacks to (about the same, as it's mostly stored).
      if (free !== null && Number.isFinite(sent) && sent * 2 > free) {
        await req.body.cancel()
        return error("The drive hasn't room for it: free some space first", 507)
      }
      try {
        const file = await Deno.open(upload, { write: true, createNew: true })
        try {
          await req.body.pipeTo(file.writable)
        } catch {
          throw new Refusal('The upload stopped before it was all sent', 400)
        }
        const session = await importZip(upload, {
          store: deps.sessions,
          newSessionId: ctx.newSessionId,
          freeSpace,
        })
        return json(
          { id: session.id, kind: session.kind, title: session.title } satisfies ImportedSession,
          201,
        )
      } finally {
        await Deno.remove(upload).catch(() => {})
      }
    }],
  ]
}
