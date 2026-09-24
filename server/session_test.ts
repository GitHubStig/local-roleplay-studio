import { assertEquals } from '@std/assert'
import { join, toFileUrl } from '@std/path'
import { dirSessionStore } from './session.ts'
import { DEFAULT_SETTINGS } from './settings.ts'
import { withTempDir } from './testing.ts'

Deno.test('dirSessionStore upgrades Turns saved with the old declined flag', () =>
  withTempDir(async (root) => {
    await Deno.mkdir(join(root, 's1'))
    await Deno.writeTextFile(
      join(root, 's1', 'session.json'),
      JSON.stringify({
        id: 's1',
        turns: [
          { index: 0, declined: false, prompt: {} },
          { index: 1, declined: true, prompt: {} },
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

Deno.test('dirSessionStore works in a directory whose path has spaces', () =>
  withTempDir(async (root) => {
    const dir = join(root, 'my sessions ü')
    await Deno.mkdir(dir)
    const store = dirSessionStore(toFileUrl(dir + '/'))
    await store.save({
      id: 's1',
      scenarioId: 'test',
      settings: DEFAULT_SETTINGS,
      seed: 1,
      createdAt: '2026-09-24T00:00:00.000Z',
      turns: [],
    })
    assertEquals((await store.load('s1'))?.id, 's1')
    assertEquals((await store.list()).length, 1)
    assertEquals(await Deno.stat(join(dir, 's1', 'session.json')).then(() => true), true)
  }))
