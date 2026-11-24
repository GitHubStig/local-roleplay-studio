import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import {
  TextReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
} from '@zip-js/zip-js'
import {
  chainOfTwo,
  getContents,
  getSession,
  getSizes,
  importedIn,
  pictureOf,
  refusalIn,
  settled,
  setup,
} from '../appTesting.ts'
import { fakeImageGenerator, withTempDir } from '../testing.ts'
import { sessionFile } from '../migrations/session/index.ts'

/** A zip made by hand: each entry's name and text, or its text and Unix mode (a link). */
async function handMade(entries: Record<string, string | { text: string; unixMode: number }>) {
  const zip = new ZipWriter(new Uint8ArrayWriter())
  for (const [name, value] of Object.entries(entries)) {
    const { text, unixMode } = typeof value === 'string'
      ? { text: value, unixMode: undefined }
      : value
    await zip.add(name, new TextReader(text), unixMode ? { unixMode, msDosCompatible: false } : {})
  }
  return await zip.close()
}

/** Sends a zip to be imported, as the web app does. */
const sendZip = (
  handler: ReturnType<typeof setup>['handler'],
  body: BodyInit,
) =>
  handler(
    new Request('http://localhost/api/sessions/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body,
    }),
  )

/** What's in the Session folder: the Sessions, and anything an import left behind. */
const inFolder = async (root: string) =>
  (await Array.fromAsync(Deno.readDir(root))).map((e) => e.name).sort()

const exported = async (res: Response) => new Uint8Array(await res.arrayBuffer())
const namesIn = async (zip: Uint8Array) =>
  (await new ZipReader(new Uint8ArrayReader(zip)).getEntries()).map((e) => e.filename)

Deno.test('GET /api/sessions/:id/contents and /api/session-sizes size what is on disk', () =>
  withTempDir(async (root) => {
    const { call, sessions } = await chainOfTwo(root)
    const contents = await getContents(call)
    assertEquals([contents.counts.frames, contents.counts.pictures], [2, 2])
    assertEquals(contents.parts.pictures > 0, true)
    const session = await sessions.load('s1')
    const image = pictureOf(session!.frames[1]).file
    const { size } = await Deno.stat(join(root, 's1', image))
    await Deno.remove(join(root, 's1', image))
    assertEquals((await getContents(call)).size, contents.size - size)
    assertEquals(await getSizes(call), { s1: contents.size - size })
    assertEquals((await call('GET', '/api/sessions/none/contents')).status, 404)
  }))

Deno.test("Open folder opens the Session's folder only for a browser on the server's machine", () =>
  withTempDir(async (root) => {
    const opened: string[] = []
    const openFolder = (path: string) => Promise.resolve(void opened.push(path))
    const local = setup({ root, settings: { textModel: 'x' }, openFolder, client: '127.0.0.1' })
    await local.call('POST', '/api/sessions', { scenarioId: 'test' })
    assertEquals((await local.call('POST', '/api/sessions/s1/open-folder', {})).status, 204)
    assertEquals(opened, [join(root, 's1')])
    const away = setup({ root, openFolder, client: '192.0.2.7' })
    const refused = await away.call('POST', '/api/sessions/s1/open-folder', {})
    assertEquals(refused.status, 409)
    assertEquals(
      (await refusalIn(refused)).error,
      "The folder opens on the server's machine, not this one",
    )
    assertEquals(opened.length, 1)
  }))

Deno.test('A Session exported and imported comes back whole, as a new Session, without its caches', () =>
  withTempDir(async (root) => {
    const app = await chainOfTwo(root)
    await Deno.mkdir(join(root, 's1', 'thumbs'))
    await Deno.writeTextFile(join(root, 's1', 'thumbs', 'frame-0-aaaaaaaa.webp'), 'cache')
    await Deno.writeTextFile(join(root, 's1', 'style.json'), '{}')
    await Deno.mkdir(join(root, 's1', 'calls'))
    await Deno.writeTextFile(join(root, 's1', 'calls', 'frame-1.json'), '[]')

    const res = await app.call('GET', '/api/sessions/s1/export')
    assertEquals(res.headers.get('content-type'), 'application/zip')
    assertEquals(
      res.headers.get('content-disposition'),
      'attachment; filename="test-shoot-s1.zip"',
    )
    const zip = await exported(res)
    const names = await namesIn(zip)
    assertEquals(names[0], 'session.json')
    const original = await getSession(app.call, 'chain')
    for (const frame of original.frames) assertEquals(names.includes(pictureOf(frame).file), true)
    assertEquals(names.includes('calls/frame-1.json'), true)
    assertEquals(names.some((n) => n.startsWith('thumbs/') || n === 'style.json'), false)

    const imported = await importedIn(await sendZip(app.handler, zip))
    assertEquals(imported.kind, 'chain')
    // A Session here has its title already.
    assertEquals(imported.title, 'Test Shoot (imported)')
    const copy = await getSession(app.call, 'chain', imported.id)
    assertEquals(copy.id, imported.id)
    assertEquals(copy.frames, original.frames)
    for (const frame of copy.frames) {
      const file = pictureOf(frame).file
      assertEquals(
        await Deno.readFile(join(root, imported.id, file)),
        await Deno.readFile(join(root, 's1', file)),
      )
    }
    // Saved at the latest version, and nothing left behind.
    const saved = JSON.parse(await Deno.readTextFile(join(root, imported.id, 'session.json')))
    assertEquals([saved.version, saved.id], [sessionFile.latest, imported.id])
    assertEquals(await inFolder(root), ['s1', imported.id].sort())
  }))

Deno.test('An import is refused whole, leaving nothing, for a zip that is no Session export', () =>
  withTempDir(async (root) => {
    const app = setup({ root, settings: { textModel: 'x' } })
    await app.call('POST', '/api/sessions', { scenarioId: 'test' })
    const text = await Deno.readTextFile(join(root, 's1', 'session.json'))
    const newer = JSON.stringify({ ...JSON.parse(text), version: sessionFile.latest + 1 })
    const cases: [string, Uint8Array<ArrayBuffer> | string, string][] = [
      ['no session.json', await handMade({ 'frame-0-aaaaaaaa.png': 'x' }), 'no session.json'],
      [
        'a parent folder',
        await handMade({ 'session.json': text, '../frame-0-aaaaaaaa.png': 'x' }),
        'outside the Session',
      ],
      [
        'an absolute path',
        await handMade({ 'session.json': text, '/tmp/frame-0-aaaaaaaa.png': 'x' }),
        'outside the Session',
      ],
      [
        'a Windows drive',
        await handMade({ 'session.json': text, 'C:/frame-0-aaaaaaaa.png': 'x' }),
        'outside the Session',
      ],
      [
        'a link',
        await handMade({
          'session.json': text,
          'frame-0-aaaaaaaa.png': { text: '/etc/passwd', unixMode: 0o120777 },
        }),
        'is a link',
      ],
      ['a newer version', await handMade({ 'session.json': newer }), 'newer version of the app'],
      ['not JSON', await handMade({ 'session.json': '{' }), "can't be read"],
      ['not a zip', 'hello', "isn't a zip"],
    ]
    for (const [what, zip, says] of cases) {
      const res = await sendZip(app.handler, zip)
      assertEquals(res.status, 400, what)
      const { error } = await refusalIn(res)
      assertEquals(error.includes(says), true, `${what}: ${error}`)
      assertEquals(await inFolder(root), ['s1'], what)
    }
  }))

Deno.test('An import leaves out what an export never holds, and is refused if the drive has no room', () =>
  withTempDir(async (root) => {
    const app = setup({ root, settings: { textModel: 'x' } })
    await app.call('POST', '/api/sessions', { scenarioId: 'test' })
    const text = await Deno.readTextFile(join(root, 's1', 'session.json'))
    const zip = await handMade({
      'session.json': text,
      'frame-0-aaaaaaaa.png': 'png',
      'notes.txt': 'not a part',
      'style.json': '{}',
    })
    const imported = await importedIn(await sendZip(app.handler, zip))
    assertEquals(await inFolder(join(root, imported.id)), ['frame-0-aaaaaaaa.png', 'session.json'])

    const full = setup({ root, freeSpace: () => Promise.resolve(10) })
    const refused = await sendZip(full.handler, zip)
    assertEquals(refused.status, 507)
    await refused.body?.cancel()
    assertEquals((await inFolder(root)).length, 2)
  }))

Deno.test('A cancelled upload leaves nothing behind', () =>
  withTempDir(async (root) => {
    const app = setup({ root })
    const body = new ReadableStream<Uint8Array>({
      start(sink) {
        sink.enqueue(new Uint8Array(1000))
        sink.error(new Error('The player cancelled'))
      },
    })
    const res = await sendZip(app.handler, body)
    assertEquals(res.status, 400)
    await res.body?.cancel()
    assertEquals(await inFolder(root), [])
  }))

Deno.test('An export holds the Session until its download ends, or is dropped', () =>
  withTempDir(async (root) => {
    const app = await chainOfTwo(root)
    const first = await app.call('GET', '/api/sessions/s1/export')
    // Meanwhile nothing is queued on it, and no second export starts.
    const queued = await app.call('POST', '/api/sessions/s1/jobs', {
      kind: 'render',
      frameIndex: 0,
    })
    assertEquals(queued.status, 409)
    await queued.body?.cancel()
    const second = await app.call('GET', '/api/sessions/s1/export')
    assertEquals(second.status, 409)
    await second.body?.cancel()
    // Dropped part way.
    const reader = first.body!.getReader()
    await reader.read()
    await reader.cancel()
    await new Promise((r) => setTimeout(r, 0))
    const again = await app.call('GET', '/api/sessions/s1/export')
    assertEquals(again.status, 200)
    await exported(again)
    // And once it's all read, the Session is free.
    const renamed = await app.call('PATCH', '/api/sessions/s1', { title: 'After' })
    assertEquals(renamed.status, 200)
    await renamed.body?.cancel()
    const queuedAfter = await app.call('POST', '/api/sessions/s1/jobs', {
      kind: 'render',
      frameIndex: 0,
    })
    assertEquals(queuedAfter.status < 300, true)
    await queuedAfter.body?.cancel()
    await settled(app.call)
  }))

Deno.test('An export is refused while work runs in the Session', () =>
  withTempDir(async (root) => {
    await chainOfTwo(root)
    const app = setup({ root, imageGenerator: fakeImageGenerator({ hang: true }) })
    const jobs = await app.call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 0 })
    const [job] = await jobs.json()
    const res = await app.call('GET', '/api/sessions/s1/export')
    assertEquals(res.status, 409)
    assertEquals((await refusalIn(res)).error.startsWith('Work is running'), true)
    await (await app.call('DELETE', `/api/sessions/s1/jobs/${job.id}`)).body?.cancel()
  }))
