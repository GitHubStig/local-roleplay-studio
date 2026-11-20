import { fromFileUrl } from '@std/path'
import type { QueueStore, SavedQueue } from './jobs.ts'
import { queueFile } from './migrations/queue/index.ts'

/** `queue.json`: every Session's jobs. */
export interface QueueFile {
  sessions: SavedQueue
}

/**
 * Keeps the queue (every Session's jobs) as JSON at `path`, beside Settings: one file for the whole
 * app, as the queue is, written whole through a temporary file so a save cut short leaves the last
 * one. Gitignored, as it holds what jobs were told (an edit's instruction, a clip's prompt). A file
 * missing is an empty queue; one that can't be read fails, saying why (and the queue then starts
 * empty, `restore`). Migrated to the latest version as it's read (ADR 0041).
 */
export function fileQueueStore(path: string | URL): QueueStore {
  const file = path instanceof URL ? fromFileUrl(path) : path
  return {
    async load() {
      let raw: string
      try {
        raw = await Deno.readTextFile(file)
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) return []
        throw err
      }
      return queueFile.migrate(JSON.parse(raw), file).sessions
    },
    async save(queue) {
      const tmp = `${file}.tmp`
      await Deno.writeTextFile(
        tmp,
        JSON.stringify(queueFile.stamp({ sessions: queue }), null, 2) + '\n',
        {
          mode: 0o600,
        },
      )
      await Deno.rename(tmp, file)
    },
  }
}
