import { assertEquals } from '@std/assert'
import type { V3 } from './v3.ts'
import { v4 } from './v4.ts'

const session = (kind: 'chain' | 'roleplay'): V3 => ({
  id: 's1',
  kind,
  title: 'A storm at sea.',
  brief: 'A storm at sea.',
  scenarioId: null,
  settings: {
    textModel: 'gemma',
    thinking: false,
    imageModel: 'qwen',
    steps: 8,
    musicBehaviour: 'story',
    musicTaste: '',
  },
  seed: 1,
  createdAt: '2026-11-25T00:00:00.000Z',
  frames: [],
  ...(kind === 'roleplay' && { cast: null, look: null, cues: [] }),
} as V3)

Deno.test('v4 says no Roleplay’s Look is behind its Cast', () => {
  assertEquals(v4(session('roleplay')), { ...session('roleplay'), lookBehindCast: false } as never)
})

Deno.test('v4 leaves other Sessions as they were', () => {
  assertEquals(v4(session('chain')), session('chain'))
})
