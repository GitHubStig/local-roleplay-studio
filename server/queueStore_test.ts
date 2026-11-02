import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import type { Job } from './jobs.ts'
import { fileQueueStore } from './queueStore.ts'
import { withTempDir } from './testing.ts'

Deno.test('The queue file keeps every Session’s jobs, and none when it’s missing', () =>
  withTempDir(async (root) => {
    const store = fileQueueStore(join(root, 'queue.json'))
    assertEquals(await store.load(), [])
    const job: Job = {
      id: 'j1',
      kind: 'render',
      frameIndex: 0,
      status: 'queued',
      createdAt: '2026-11-02T10:00:00.000Z',
      machine: 'here',
    }
    await store.save([{ sessionId: 's1', jobs: [job] }])
    assertEquals(await store.load(), [{ sessionId: 's1', jobs: [job] }])
    const files = await Array.fromAsync(Deno.readDir(root))
    assertEquals(files.map((f) => f.name), ['queue.json'])
  }))
