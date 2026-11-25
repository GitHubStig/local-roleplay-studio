/**
 * A Session clone: a new Session made from one in the Session folder, as exporting it and importing
 * the zip would make it, without the zip. What an export holds (its text, as the ticks leave it, and
 * the files a part owns; never its caches) is copied into a folder beside the Sessions, which is
 * moved into place once it's all there, so a clone that fails leaves nothing behind.
 */
import { dirname, join } from '@std/path'
import { bytes } from '../../shared/bytes.ts'
import type { Session } from '../../shared/session.ts'
import { fillingDir, type ImportDeps, markedTitle, NoRoomRefusal, placeSession } from './unzip.ts'

/** The title a clone takes: its own, marked "(copy)", as its Session is here with it. */
export const clonedTitle = (title: string, taken: Iterable<string>) =>
  markedTitle(title, taken, ' (copy)')

/**
 * Copies `files` (paths in folder `dir`, with their sizes; not its text) and `session`, the text as
 * it's to be kept, into a new Session. Refused, leaving nothing, if the drive hasn't room.
 */
export async function cloneSession(
  dir: string,
  session: Session,
  files: { path: string; size: number }[],
  deps: ImportDeps,
): Promise<Session> {
  const id = deps.newSessionId()
  const target = deps.store.dir(id)
  const temp = fillingDir(target, id)
  // A copy may take no room (APFS clones a file), but can't be told to: it's checked as if it did.
  const size = files.reduce((n, f) => n + f.size, 0)
  const free = await deps.freeSpace(dirname(target))
  if (free !== null && size > free) {
    throw new NoRoomRefusal(`It copies ${bytes(size)}, and the drive has ${bytes(free)} free`)
  }
  try {
    await Deno.mkdir(temp)
    for (const f of files) {
      await Deno.mkdir(dirname(join(temp, f.path)), { recursive: true })
      await Deno.copyFile(join(dir, f.path), join(temp, f.path))
    }
    const titles = (await deps.store.list()).map((s) => s.title)
    return await placeSession(temp, target, session, id, clonedTitle(session.title, titles))
  } catch (err) {
    await Deno.remove(temp, { recursive: true }).catch(() => {})
    throw err
  }
}
