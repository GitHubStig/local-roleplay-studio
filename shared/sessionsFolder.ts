/** Checking a folder to keep Sessions in. Shared by the server and the web app: types and plain values only. */

export type FolderCheck =
  | { ok: true; path: string; count: number; exists: boolean; same: boolean }
  | { ok: false; reason: string }
