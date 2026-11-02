import { assert, assertEquals } from '@std/assert'
import { withTempDir } from './testing.ts'
import { chainOfTwo, settled } from './appTesting.ts'

Deno.test('The queue lists every Session’s jobs, with their Session, times and machines', () =>
  withTempDir(async (root) => {
    const { call } = await chainOfTwo(root)
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 1 })
    await settled(call)
    const queue = await (await call('GET', '/api/queue')).json()
    assertEquals(queue.machines, [{ key: 'here', backends: ['This machine', 'Ollama'] }])
    assertEquals(queue.sessions.map((s: { id: string; kind: string }) => [s.id, s.kind]), [
      ['s1', 'chain'],
    ])
    const [job] = queue.jobs
    assertEquals([job.sessionId, job.kind, job.status, job.machine], [
      's1',
      'render',
      'done',
      'here',
    ])
    assert(job.startedAt <= job.endedAt)
    assertEquals(queue.text, [])
  }))
