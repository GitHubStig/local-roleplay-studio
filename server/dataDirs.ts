import { dirname, fromFileUrl, join } from '@std/path'

/** The folder an install keeps the player's data in, under each OS's own folders. */
export const APP_FOLDER = 'Local Roleplay Studio'

/** Where the player's data is kept: what the app writes, apart from what ships with it. */
export interface DataDirs {
  /** `settings.json`. */
  settings: string
  /** `queue.json`. */
  queue: string
  /** The player's Scenarios. */
  scenarios: string
  /** The Session folder, unless Settings keep another (`sessionsFolder`). */
  sessions: string
  /** Pages exported from Compare, where the player can find them. */
  exports: string
}

/** What the folders are worked out from: this run's, or a test's. */
export interface DataPlace {
  /** A `deno compile` binary, whose own files are read-only (`Deno.build.standalone`). */
  standalone: boolean
  os: typeof Deno.build.os
  env: (name: string) => string | undefined
  /** The repo's folder, where a clone keeps its data. */
  root: string
}

/** One folder holding it all, as a clone keeps it. */
const inOne = (dir: string): DataDirs => ({
  settings: join(dir, 'settings.json'),
  queue: join(dir, 'queue.json'),
  scenarios: join(dir, 'scenarios'),
  sessions: join(dir, 'sessions'),
  exports: join(dir, 'exports'),
})

/**
 * Where the player's data goes. `DATA_DIR` puts it all in one folder. Otherwise a clone keeps it
 * in the repo, as it always has, and an install, which can't write beside its code, uses the OS's
 * folders for an app's settings and data, with exports in Documents.
 */
export function dataDirs({ standalone, os, env, root }: DataPlace): DataDirs {
  const override = env('DATA_DIR')
  if (override) return inOne(override)
  if (!standalone) return inOne(root)
  const home = env(os === 'windows' ? 'USERPROFILE' : 'HOME')
  if (!home) throw new Error(`Set DATA_DIR: there's no home folder to keep the data in`)
  const exports = join(home, 'Documents', APP_FOLDER)
  if (os === 'darwin') {
    return { ...inOne(join(home, 'Library', 'Application Support', APP_FOLDER)), exports }
  }
  if (os === 'windows') {
    // Settings roam with the account; Sessions, the queue and Scenarios stay on this PC, so
    // pictures don't.
    const roaming = join(env('APPDATA') ?? join(home, 'AppData', 'Roaming'), APP_FOLDER)
    const local = join(env('LOCALAPPDATA') ?? join(home, 'AppData', 'Local'), APP_FOLDER)
    return { ...inOne(local), settings: join(roaming, 'settings.json'), exports }
  }
  const xdg = (name: string, fallback: string) =>
    join(env(name) || join(home, fallback), APP_FOLDER)
  const data = xdg('XDG_DATA_HOME', '.local/share')
  return {
    ...inOne(data),
    settings: join(xdg('XDG_CONFIG_HOME', '.config'), 'settings.json'),
    queue: join(xdg('XDG_STATE_HOME', '.local/state'), 'queue.json'),
    exports,
  }
}

/** This run's folders: the repo's when run from a clone. */
export function thisRunsDataDirs(): DataDirs {
  return dataDirs({
    standalone: Deno.build.standalone,
    os: Deno.build.os,
    env: (name) => Deno.env.get(name),
    root: fromFileUrl(new URL('../', import.meta.url)),
  })
}

/**
 * Makes the folders `settings.json` and `queue.json` are written in, which an install starts
 * without. The others are made when first written to.
 */
export async function makeDataDirs(dirs: DataDirs): Promise<void> {
  for (const file of [dirs.settings, dirs.queue]) {
    await Deno.mkdir(dirname(file), { recursive: true })
  }
}
