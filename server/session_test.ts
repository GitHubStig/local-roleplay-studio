import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { dirSessionStore } from './session.ts'
import { withTempDir } from './testing.ts'

Deno.test('dirSessionStore upgrades Turns saved with the old declined flag', () =>
  withTempDir(async (root) => {
    await Deno.mkdir(join(root, 's1'))
    await Deno.writeTextFile(
      join(root, 's1', 'session.json'),
      JSON.stringify({
        id: 's1',
        turns: [
          { index: 0, declined: false, scene: {} },
          { index: 1, declined: true, scene: {} },
        ],
      }),
    )
    const session = await dirSessionStore(root).load('s1')
    assertEquals(session!.turns.map((t) => t.outcome), ['done', 'declined'])
    assertEquals('declined' in session!.turns[1], false)
  }))

Deno.test('dirSessionStore rejects ids that could escape its directory', async () => {
  assertEquals(await dirSessionStore('/tmp').load('../etc'), undefined)
})
