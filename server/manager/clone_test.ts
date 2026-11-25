import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { chainOfTwo, clonedIn, getSession, pictureOf, refusalIn, setup } from '../appTesting.ts'
import { fakeImageGenerator, withTempDir } from '../testing.ts'
import { sessionFile } from '../migrations/session/index.ts'
import { KEEP_ALL } from '../../shared/keep.ts'
import { clonedTitle } from './clone.ts'

const inFolder = async (root: string) =>
  (await Array.fromAsync(Deno.readDir(root))).map((e) => e.name).sort()

Deno.test('A clone is the Session whole, as a new one titled "(copy)", without its caches', () =>
  withTempDir(async (root) => {
    const app = await chainOfTwo(root)
    await Deno.mkdir(join(root, 's1', 'thumbs'))
    await Deno.writeTextFile(join(root, 's1', 'thumbs', 'frame-0-aaaaaaaa.webp'), 'cache')
    await Deno.writeTextFile(join(root, 's1', 'style.json'), '{}')
    await Deno.mkdir(join(root, 's1', 'calls'))
    await Deno.writeTextFile(join(root, 's1', 'calls', 'frame-1.json'), '[]')
    await Deno.writeTextFile(join(root, 's1', 'notes.txt'), 'not a part')

    const made = await clonedIn(await app.call('POST', '/api/sessions/s1/clone', {}))
    assertEquals([made.kind, made.title], ['chain', 'Test Shoot (copy)'])
    const original = await getSession(app.call, 'chain')
    const copy = await getSession(app.call, 'chain', made.id)
    assertEquals(copy.frames, original.frames)
    for (const frame of copy.frames) {
      const file = pictureOf(frame).file
      assertEquals(
        await Deno.readFile(join(root, made.id, file)),
        await Deno.readFile(join(root, 's1', file)),
      )
    }
    const files = (await inFolder(join(root, made.id))).filter((n) => !n.startsWith('frame-'))
    assertEquals(files, ['calls', 'session.json'])
    const saved = JSON.parse(await Deno.readTextFile(join(root, made.id, 'session.json')))
    assertEquals([saved.version, saved.id], [sessionFile.latest, made.id])
    // Nothing left behind, and a clone of a clone is a copy again.
    assertEquals(await inFolder(root), ['s1', made.id].sort())
    const again = await clonedIn(await app.call('POST', `/api/sessions/${made.id}/clone`, {}))
    assertEquals(again.title, 'Test Shoot (copy) (copy)')
  }))

Deno.test('A clone of what is ticked leaves out the files, and the records, of what is not', () =>
  withTempDir(async (root) => {
    const app = await chainOfTwo(root)
    const session = await getSession(app.call, 'chain')
    const leftOut = { ...KEEP_ALL, imageModels: [session.settings.imageModel] }
    const made = await clonedIn(await app.call('POST', '/api/sessions/s1/clone', { leftOut }))
    assertEquals(await inFolder(join(root, made.id)), ['session.json'])
    const copy = await getSession(app.call, 'chain', made.id)
    assertEquals(copy.frames.map((f) => f.pictures), [[], []])
    assertEquals((await getSession(app.call, 'chain')).frames, session.frames)
    const bad = await app.call('POST', '/api/sessions/s1/clone', { leftOut: { edits: true } })
    assertEquals(bad.status, 400)
    await bad.body?.cancel()
  }))

Deno.test('A clone is refused while work runs, or the drive has no room, leaving nothing', () =>
  withTempDir(async (root) => {
    await chainOfTwo(root)
    const full = setup({ root, freeSpace: () => Promise.resolve(10) })
    const refused = await full.call('POST', '/api/sessions/s1/clone', {})
    assertEquals(refused.status, 507)
    await refused.body?.cancel()
    assertEquals(await inFolder(root), ['s1'])

    const app = setup({ root, imageGenerator: fakeImageGenerator({ hang: true }) })
    const jobs = await app.call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 0 })
    const [job] = await jobs.json()
    const res = await app.call('POST', '/api/sessions/s1/clone', {})
    assertEquals(res.status, 409)
    assertEquals((await refusalIn(res)).error.startsWith('Work is running'), true)
    await (await app.call('DELETE', `/api/sessions/s1/jobs/${job.id}`)).body?.cancel()
    assertEquals(await inFolder(root), ['s1'])
  }))

Deno.test('A clone is marked "(copy)" only when a Session here has its title', () => {
  assertEquals(clonedTitle('Tavern', ['Tavern']), 'Tavern (copy)')
  assertEquals(clonedTitle('Harbour', ['Tavern']), 'Harbour')
})
