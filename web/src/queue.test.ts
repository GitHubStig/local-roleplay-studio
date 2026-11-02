import { describe, expect, it } from 'vitest'
import type { Queue } from './api'
import { lasted, machineQueues, textCallName } from './queue'

const job = (id: string, extra: Partial<Queue['jobs'][number]> = {}): Queue['jobs'][number] => ({
  id,
  kind: 'render',
  frameIndex: 0,
  status: 'queued',
  createdAt: '2026-11-02T10:00:00.000Z',
  machine: 'here',
  sessionId: 's1',
  ...extra,
})

describe('machineQueues', () => {
  it('lists each machine’s line: text calls first among the waiting, clips last of those in turn', () => {
    const queue: Queue = {
      machines: [
        { key: 'here', backends: ['This machine', 'Ollama'] },
        { key: '192.168.50.85', backends: ['ComfyUI'] },
      ],
      sessions: [{ id: 's1', kind: 'roleplay', title: 'The tavern' }],
      jobs: [
        job('r1', { status: 'running', phase: 'image', startedAt: '2026-11-02T10:00:01.000Z' }),
        job('c1', {
          kind: 'clip',
          status: 'running',
          phase: 'queued',
          startedAt: '2026-11-02T10:00:02.000Z',
        }),
        job('r2', { status: 'running', phase: 'queued', startedAt: '2026-11-02T10:00:03.000Z' }),
        job('r3'),
        job('d1', { status: 'done', endedAt: '2026-11-02T09:00:00.000Z' }),
        job('d2', { status: 'failed', endedAt: '2026-11-02T09:30:00.000Z' }),
      ],
      text: [{
        machine: 'here',
        session: 's1',
        job: 'reply',
        status: 'waiting',
        since: '2026-11-02T10:00:04.000Z',
      }],
    }
    const [here, pc] = machineQueues(queue)
    const ids = (rows: typeof here.running) =>
      rows.map((r) => r.type === 'job' ? r.job.id : r.call.job)
    expect([here.name, here.backends]).toEqual(['This machine', ['Ollama']])
    expect(ids(here.running)).toEqual(['r1'])
    expect(ids(here.waiting)).toEqual(['reply', 'r2', 'c1', 'r3'])
    expect(ids(here.finished)).toEqual(['d2', 'd1'])
    expect(here.waiting[0].session?.title).toBe('The tavern')
    expect([pc.name, pc.running, pc.waiting, pc.finished]).toEqual(['192.168.50.85', [], [], []])
  })
})

describe('lasted', () => {
  it('says seconds, then minutes and seconds', () => {
    expect(lasted('2026-11-02T10:00:00.000Z', '2026-11-02T10:00:12.400Z')).toBe('12 s')
    expect(lasted('2026-11-02T10:00:00.000Z', '2026-11-02T10:03:05.000Z')).toBe('3 min 5 s')
  })
})

it('names text calls as the page shows them, Text for one it doesn’t know', () => {
  expect([textCallName('reply'), textCallName('write-frame'), textCallName('new')]).toEqual([
    'Reply',
    'Frame',
    'Text',
  ])
})
