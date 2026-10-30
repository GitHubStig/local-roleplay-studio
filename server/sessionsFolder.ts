import { dirname, isAbsolute, join, resolve } from '@std/path'
import { error, json, readJson, type Route } from './http.ts'
import { dirSessionStore } from './session.ts'

/** The folder the Sessions are kept in, which the player can move to another while the app runs. */
export interface SessionsFolder {
  /** The app's own `sessions/` folder: what an empty Settings choice means. */
  default: string
  inUse(): string
  /** Keeps Sessions in `path` from now on (the folder is made if it isn't there). */
  moveTo(path: string): Promise<void>
}

export type FolderCheck =
  | { ok: true; path: string; count: number; exists: boolean; same: boolean }
  | { ok: false; reason: string }

/** A folder's path as one thing: no trailing slash, and links followed where it exists. */
async function sameFolder(a: string, b: string): Promise<boolean> {
  const real = (path: string) => Deno.realPath(path).catch(() => resolve(path))
  return await real(a) === await real(b)
}

/** Whether `path` can hold Sessions, and how many it already does. '' is the default folder. */
export async function checkFolder(folder: SessionsFolder, path: string): Promise<FolderCheck> {
  const given = path.trim() || folder.default
  if (!isAbsolute(given)) {
    return { ok: false, reason: 'Give a full path, like /Users/you/Sessions' }
  }
  const wanted = resolve(given)
  let exists = true
  try {
    if (!(await Deno.stat(wanted)).isDirectory) return { ok: false, reason: `${wanted} is a file` }
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) return { ok: false, reason: (err as Error).message }
    exists = false
    // A folder is made only inside one that is there: a drive that isn't plugged in has none.
    const parent = dirname(wanted)
    if (!(await Deno.stat(parent).then((s) => s.isDirectory, () => false))) {
      return { ok: false, reason: `${parent} doesn't exist: is the drive connected?` }
    }
  }
  const count = exists ? (await dirSessionStore(wanted).list()).length : 0
  return { ok: true, path: wanted, count, exists, same: await sameFolder(wanted, folder.inUse()) }
}

/** Makes sure Sessions can be saved in `path`: the folder is made and written to. */
async function canWriteTo(path: string): Promise<string | null> {
  try {
    await Deno.mkdir(path, { recursive: true })
    const probe = join(path, '.write-test')
    await Deno.writeTextFile(probe, '')
    await Deno.remove(probe)
    return null
  } catch (err) {
    return `Can't write to ${path}: ${(err as Error).message}`
  }
}

export interface SessionsFolderRouteContext {
  folder: SessionsFolder
  /** The folder Settings keep, which is saved when the player moves to another. */
  keep(path: string): Promise<void>
  /** Whether any Session has work running or waiting: Sessions can't move meanwhile. */
  busy(): Promise<boolean>
  /** Asks the player for a folder with the machine's own dialog; null if they cancel. */
  pick?: () => Promise<string | null>
}

export function sessionsFolderRoutes(ctx: SessionsFolderRouteContext): Route[] {
  const shown = async () => ({
    inUse: resolve(ctx.folder.inUse()),
    default: resolve(ctx.folder.default),
    count: (await dirSessionStore(ctx.folder.inUse()).list()).length,
  })
  const pathOf = async (req: Request) => {
    const body = await readJson(req) as { path?: unknown } | undefined
    return typeof body?.path === 'string' ? body.path : undefined
  }
  return [
    ['GET', new URLPattern({ pathname: '/api/sessions-folder' }), async () => json(await shown())],

    // The machine's folder dialog opens on the machine the server runs on.
    ['POST', new URLPattern({ pathname: '/api/sessions-folder/pick' }), async () => {
      if (!ctx.pick) return error("This machine can't open a folder dialog", 409)
      try {
        return json({ path: await ctx.pick() })
      } catch (err) {
        return error((err as Error).message, 500)
      }
    }],

    // What a folder holds, to show before the player confirms; nothing changes.
    ['POST', new URLPattern({ pathname: '/api/sessions-folder/check' }), async (req) => {
      const path = await pathOf(req)
      if (path === undefined) return error('Give a path', 400)
      const checked = await checkFolder(ctx.folder, path)
      return checked.ok ? json(checked) : error(checked.reason, 400)
    }],

    // Moves to the folder now. Refused while work is running, as it saves into the old one.
    ['PUT', new URLPattern({ pathname: '/api/sessions-folder' }), async (req) => {
      const path = await pathOf(req)
      if (path === undefined) return error('Give a path', 400)
      const checked = await checkFolder(ctx.folder, path)
      if (!checked.ok) return error(checked.reason, 400)
      if (await ctx.busy()) {
        return error('Wait for running and queued work to finish, or cancel it', 409)
      }
      const unwritable = await canWriteTo(checked.path)
      if (unwritable) return error(unwritable, 400)
      const before = ctx.folder.inUse()
      try {
        await ctx.folder.moveTo(checked.path)
        await ctx.keep(checked.path === ctx.folder.default ? '' : checked.path)
      } catch (err) {
        // Settings still name the old folder, so the app goes back to it.
        await ctx.folder.moveTo(before).catch(() => {})
        throw err
      }
      return json(await shown())
    }],
  ]
}
