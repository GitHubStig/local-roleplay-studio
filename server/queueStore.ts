import { fromFileUrl } from '@std/path'
import type { QueueStore, SavedQueue } from './jobs.ts'

/**
 * Keeps the queue (every Session's jobs) as JSON at `path`, beside Settings: one file for the whole
 * app, as the queue is, written whole through a temporary file so a save cut short leaves the last
 * one. Gitignored, as it holds what jobs were told (an edit's instruction, a clip's prompt). A file
 * missing or unreadable is an empty queue.
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
      const parsed = JSON.parse(raw) as { sessions?: SavedQueue }
      return Array.isArray(parsed?.sessions) ? parsed.sessions : []
    },
    async save(queue) {
      const tmp = `${file}.tmp`
      await Deno.writeTextFile(tmp, JSON.stringify({ sessions: queue }, null, 2) + '\n', {
        mode: 0o600,
      })
      await Deno.rename(tmp, file)
    },
  }
}
