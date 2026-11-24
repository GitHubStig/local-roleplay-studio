import { assertEquals, assertRejects } from '@std/assert'
import { join, toFileUrl } from '@std/path'
import { dirSessionStore } from './session.ts'
import { DEFAULT_SETTINGS } from './settings.ts'
import { sessionFile } from './migrations/session/index.ts'
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
      title: 'A test chain',
      brief: null,
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

const chain = {
  id: 's1',
  kind: 'chain' as const,
  title: 'A test chain',
  brief: null,
  scenarioId: 'test',
  settings: DEFAULT_SETTINGS,
  seed: 1,
  createdAt: '2026-09-24T00:00:00.000Z',
  frames: [],
}

Deno.test('dirSessionStore saves the latest version, first, and loads without it', () =>
  withTempDir(async (root) => {
    const store = dirSessionStore(root)
    await store.save(chain)
    const saved = JSON.parse(await Deno.readTextFile(join(root, 's1', 'session.json')))
    assertEquals(Object.keys(saved)[0], 'version')
    assertEquals(saved.version, sessionFile.latest)
    assertEquals(await store.load('s1'), chain)
  }))

Deno.test('dirSessionStore migrates a file from before versions without rewriting it', () =>
  withTempDir(async (root) => {
    const path = join(root, 's1', 'session.json')
    await Deno.mkdir(join(root, 's1'))
    // From before titles were kept: it's titled as the app showed it, by its Scenario's id here.
    const { title: _, ...untitled } = chain
    const text = JSON.stringify(untitled)
    await Deno.writeTextFile(path, text)
    assertEquals(await dirSessionStore(root).load('s1'), { ...chain, title: 'test' })
    assertEquals(await Deno.readTextFile(path), text)
  }))

Deno.test('dirSessionStore refuses a Session from a newer app, and leaves it out of the list', () =>
  withTempDir(async (root) => {
    await Deno.mkdir(join(root, 's1'))
    await Deno.writeTextFile(
      join(root, 's1', 'session.json'),
      JSON.stringify({ ...chain, version: sessionFile.latest + 1 }),
    )
    const store = dirSessionStore(root)
    await assertRejects(() => store.load('s1'), Error, 'from a newer app')
    const warn = console.warn
    console.warn = () => {}
    try {
      assertEquals(await store.list(), [])
    } finally {
      console.warn = warn
    }
  }))
