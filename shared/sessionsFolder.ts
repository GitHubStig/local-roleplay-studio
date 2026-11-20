/** Checking a folder to keep Sessions in. Shared by the server and the web app: types and plain values only. */

export type FolderCheck =
  | { ok: true; path: string; count: number; exists: boolean; same: boolean }
  | { ok: false; reason: string }

/** The folder Sessions are kept in, the default, and how many Sessions are in use (`GET /api/sessions-folder`). */
export interface SessionsFolderInfo {
  inUse: string
  default: string
  count: number
}

/** The folder the machine's own dialog picked; null if the player cancelled (`POST /api/sessions-folder/pick`). */
export interface PickedFolder {
  path: string | null
}
