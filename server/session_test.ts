import { assertEquals } from '@std/assert'
import { join, toFileUrl } from '@std/path'
import { dirSessionStore } from './session.ts'
import { DEFAULT_SETTINGS } from './settings.ts'
import { withTempDir } from './testing.ts'

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
      kind: 'chain',
      scenarioId: 'test',
      settings: DEFAULT_SETTINGS,
      seed: 1,
      createdAt: '2026-09-24T00:00:00.000Z',
      frames: [],
    })
    assertEquals((await store.load('s1'))?.id, 's1')
    assertEquals((await store.list()).length, 1)
    assertEquals(await Deno.stat(join(dir, 's1', 'session.json')).then(() => true), true)
  }))
