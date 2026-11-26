import { assertEquals } from '@std/assert'
import type { V1 } from './v1.ts'
import { v2 } from './v2.ts'

const job = {
  frameIndex: 0,
  status: 'done',
  createdAt: '2026-11-26T00:00:00.000Z',
  machine: 'here',
} as const

Deno.test('v2 marks every edit queued before as no camera move, and leaves other jobs as they were', () => {
  const doc: V1 = {
    sessions: [{
      sessionId: 's1',
      jobs: [
        { ...job, id: 'a', kind: 'edit', edit: { instruction: 'A low angle.' } },
        { ...job, id: 'b', kind: 'edit', edit: { instruction: 'A cap.', mask: 'mask-0-1.png' } },
        { ...job, id: 'c', kind: 'render' },
      ],
    }],
  }
  assertEquals(v2(doc), {
    sessions: [{
      sessionId: 's1',
      jobs: [
        { ...job, id: 'a', kind: 'edit', edit: { instruction: 'A low angle.', camera: false } },
        {
          ...job,
          id: 'b',
          kind: 'edit',
          edit: { instruction: 'A cap.', mask: 'mask-0-1.png', camera: false },
        },
        { ...job, id: 'c', kind: 'render' },
      ],
    }],
  })
})
