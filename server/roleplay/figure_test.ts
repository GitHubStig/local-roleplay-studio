import { assertEquals } from '@std/assert'
import { latestClothing } from './figure.ts'
import { testCast } from './testing.ts'
import type { RoleplayFrame, RoleplaySession, Shown } from './types.ts'

const frame = (index: number, shown: Shown | undefined, clothing?: string): RoleplayFrame => ({
  index,
  message: null,
  reply: { internal: '', actions: '', dialogue: '' },
  image: null,
  ...(shown ? { shown } : {}),
  ...(clothing ? { clothing } : {}),
  createdAt: '2026-10-02T00:00:00.000Z',
})
const roleplay = (frames: RoleplayFrame[]) =>
  ({ cast: testCast, frames }) as unknown as RoleplaySession

Deno.test("A portrait wears only what the latest picture says they wear, not the other's clothes", () => {
  const session = roleplay([
    frame(0, 'both', 'Mira wears a navy coat, while Sam Reyes wears oilskins.'),
    frame(
      1,
      'both',
      'Mira wears a grey sweater. Sam wears a soaked shirt; the cook wears an apron.',
    ),
    // Says nothing of Sam: Sam's clothes come from the picture before.
    frame(2, 'both', 'Mira wears a storm jacket and boots.'),
    frame(3, 'character', 'She wears a wet storm jacket.'),
    frame(4, 'none', 'The coat hangs by the door.'),
  ])
  assertEquals(latestClothing(session, 'character'), 'She wears a wet storm jacket.')
  assertEquals(latestClothing(session, 'persona'), 'Sam wears a soaked shirt.')
  assertEquals(
    latestClothing(roleplay(session.frames.slice(0, 1)), 'persona'),
    'Sam Reyes wears oilskins.',
  )
  assertEquals(latestClothing(roleplay([frame(0, 'both')]), 'character'), undefined)
})
