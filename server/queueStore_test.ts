import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import type { Job } from '../shared/jobs.ts'
import { fileQueueStore } from './queueStore.ts'
import { queueFile } from './migrations/queue/index.ts'
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

Deno.test('The queue file is read from before versions, and saved at the latest', () =>
  withTempDir(async (root) => {
    const path = join(root, 'queue.json')
    await Deno.writeTextFile(path, JSON.stringify({ sessions: [{ sessionId: 's1', jobs: [] }] }))
    const store = fileQueueStore(path)
    assertEquals(await store.load(), [{ sessionId: 's1', jobs: [] }])
    await store.save([])
    assertEquals(JSON.parse(await Deno.readTextFile(path)), {
      version: queueFile.latest,
      sessions: [],
    })
  }))

Deno.test('The queue file refuses one from a newer app', () =>
  withTempDir(async (root) => {
    const path = join(root, 'queue.json')
    await Deno.writeTextFile(path, JSON.stringify({ version: queueFile.latest + 1, sessions: [] }))
    await assertRejects(() => fileQueueStore(path).load(), Error, 'from a newer app')
  }))
