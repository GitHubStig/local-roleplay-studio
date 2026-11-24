/**
 * The Session manager's routes: what each Session holds and how big it is, opening its folder, and
 * exporting a Session as a zip and importing one (`zip.ts`, `unzip.ts`).
 */
import { dirname, join } from '@std/path'
import { error, fromThisMachine, json, readJson, type Route } from '../http.ts'
import { contentsOf, filesIn, sizeOf } from '../sessionParts.ts'
import { goneWith, keepOptions, leftOutFrom, removeLeftOut, sizesIn } from '../keep.ts'
import { sessionFile } from '../migrations/session/index.ts'
import type { Session } from '../../shared/session.ts'
import {
  KEEP_ALL,
  type KeepOptions,
  type KeepPreview,
  type LeftOut,
  type Removed,
} from '../../shared/keep.ts'
import type { AppContext } from '../appContext.ts'
import { isOpen } from '../jobs.ts'
import { Refusal } from '../refusal.ts'
import type { SessionContents, SessionSizes } from '../../shared/sessionContents.ts'
import { exportName, type ImportedSession } from '../../shared/sessionZip.ts'
import { EXPORT_ZIP, exportedFiles, SESSION_FILE, zipFiles } from './zip.ts'
import { importZip } from './unzip.ts'
import { freeSpace as osFreeSpace } from './freeSpace.ts'

export function managerRoutes(ctx: AppContext): Route[] {
  const { deps, jobs, active, loadSession } = ctx
  const freeSpace = deps.freeSpace ?? osFreeSpace
  /** Refused while work runs in the Session: what it saves could be left out, or vanish. */
  const refuseWhileWorking = (session: Session, doing: string) => {
    if (active.has(session.id) || jobs.list(session.id).some(isOpen)) {
      throw new Refusal(
        `Work is running in this Session: wait for it, or cancel it, to ${doing}`,
        409,
      )
    }
  }
  /** What the ticks leave out of a Session now: its files, and what goes and its bytes. */
  async function choice(session: Session, left: LeftOut) {
    const files = await filesIn(deps.sessions.dir(session.id))
    const sizes = sizesIn(files)
    return { sizes, ...goneWith(session, left, files.map((f) => f.path), sizes) }
  }

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

    // What there is to keep or leave out of the Session, each with its size on its own.
    ['GET', new URLPattern({ pathname: '/api/sessions/:id/keep' }), async (_req, p) => {
      const session = await loadSession(p.id!)
      const dir = deps.sessions.dir(session.id)
      const { counts } = await contentsOf(session, dir)
      return json(
        keepOptions(session, sizesIn(await filesIn(dir)), counts.calls) satisfies KeepOptions,
      )
    }],

    // What a choice of ticks (`{ leftOut }`) would keep and leave out; nothing changes.
    ['POST', new URLPattern({ pathname: '/api/sessions/:id/keep' }), async (req, p) => {
      const body = await readJson(req) as { leftOut?: unknown } | undefined
      const left = leftOutFrom(body?.leftOut)
      const session = await loadSession(p.id!)
      const dir = deps.sessions.dir(session.id)
      const { sizes, size } = await choice(session, left)
      const total = (await exportedFiles(dir)).reduce((n, f) => n + f.size, 0)
      // The pictures' ticks alone, for what's left of what was made from them.
      const after = goneWith(session, { ...KEEP_ALL, ...picturesOf(left) }, [], sizes).after
      return json(
        {
          kept: total - size,
          leftOut: size,
          // The calls aren't counted again (each log read whole): no picture's tick changes them.
          after: keepOptions(after, sizes, 0),
        } satisfies KeepPreview,
      )
    }],

    // Remove the rest: leaves out of the Session itself what `{ leftOut }` names, its records and
    // its files, for good. Refused while work runs in it.
    ['POST', new URLPattern({ pathname: '/api/sessions/:id/remove' }), async (req, p) => {
      const body = await readJson(req) as { leftOut?: unknown } | undefined
      const left = leftOutFrom(body?.leftOut)
      return await ctx.locked(p.id!, 'remove', async (session) => {
        refuseWhileWorking(session, 'remove from it')
        const files = await filesIn(deps.sessions.dir(session.id))
        return json((await removeLeftOut(deps.sessions, session, left, files)) satisfies Removed)
      })
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
    // `?leave=`, what's left out (`LeftOut`, as JSON), exports what's ticked: its text as it would
    // be left, and only the files kept.
    ['GET', new URLPattern({ pathname: '/api/sessions/:id/export' }), async (req, p) => {
      const leave = new URL(req.url).searchParams.get('leave')
      let left: LeftOut | null = null
      if (leave !== null) {
        let parsed: unknown
        try {
          parsed = JSON.parse(leave)
        } catch {
          throw new Refusal("What's left out isn't JSON", 400)
        }
        left = leftOutFrom(parsed)
      }
      const session = await loadSession(p.id!)
      refuseWhileWorking(session, 'export it')
      const busy = ctx.lock(session.id, 'export')
      if (busy) return busy
      try {
        const dir = deps.sessions.dir(session.id)
        let files: { path: string; data?: Uint8Array<ArrayBuffer> }[] = await exportedFiles(dir)
        if (left) {
          const { after, gone } = await choice(session, left)
          const goes = new Set(gone)
          const text = JSON.stringify(sessionFile.stamp(after), null, 2) + '\n'
          files = files.filter((f) => !goes.has(f.path)).map((f) =>
            f.path === SESSION_FILE ? { ...f, data: new TextEncoder().encode(text) } : f
          )
        }
        const { stream, done } = zipFiles(dir, files, EXPORT_ZIP)
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

/** The pictures' ticks of a choice, alone. */
const picturesOf = ({ imageModels, upscales, edits, chosenOnly }: LeftOut): Partial<LeftOut> => ({
  imageModels,
  upscales,
  edits,
  chosenOnly,
})
