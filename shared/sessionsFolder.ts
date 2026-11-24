/** Checking a folder to keep Sessions in. Shared by the server and the web app: types and plain values only. */

export type FolderCheck =
  | { ok: true; path: string; count: number; exists: boolean; same: boolean }
  | { ok: false; reason: string }

/** A Session folder the Session manager offers: the app's own, or one used before. */
export interface KnownFolder {
  path: string
  /** How many Sessions it holds; null when it isn't there (a drive not connected). */
  count: number | null
  /** The app's own folder, which can't be forgotten. */
  default: boolean
}

/** The kind of machine the server runs on, which names its file manager (Finder, Explorer). */
export type ServerOs = 'mac' | 'windows' | 'other'

/**
 * The folder Sessions are kept in, the default, how many Sessions are in use, and every folder
 * offered (`GET /api/sessions-folder`).
 */
export interface SessionsFolderInfo {
  inUse: string
  default: string
  count: number
  /** The app's own folder first, then those used before, the latest first; the one in use among them. */
  folders: KnownFolder[]
  /**
   * The browser asking is on the server's own machine (`fromThisMachine`), so the machine's folder
   * dialog and file manager open in front of the player.
   */
  here: boolean
  os: ServerOs
}

/** The folder the machine's own dialog picked; null if the player cancelled (`POST /api/sessions-folder/pick`). */
export interface PickedFolder {
  path: string | null
}
