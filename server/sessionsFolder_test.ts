import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { dirSessionStore } from './session.ts'
import { type SessionsFolder, sessionsFolderRoutes } from './sessionsFolder.ts'

async function fixture(busy = false) {
  const root = await Deno.makeTempDir()
  const old = join(root, 'old')
  await Deno.mkdir(join(old, 'a'), { recursive: true })
  await Deno.writeTextFile(
    join(old, 'a', 'session.json'),
    JSON.stringify({ id: 'a', kind: 'chain', frames: [] }),
  )
  const store = dirSessionStore(old)
  const folder: SessionsFolder = {
    default: old,
    inUse: store.root,
    moveTo: (path) => Promise.resolve(store.moveTo(path)),
  }
  const kept: string[] = []
  const routes = sessionsFolderRoutes({
    folder,
    keep: (path) => Promise.resolve(void kept.push(path)),
    busy: () => Promise.resolve(busy),
    pick: () => Promise.resolve('/picked'),
  })
  const call = (method: string, path: string, body?: unknown) => {
    const url = new URL(`http://x${path}`)
    const [, , handle] = routes.find(([m, p]) => m === method && p.test(url))!
    return handle(
      new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
      {},
    )
  }
  return { root, old, store, kept, call, done: () => Deno.remove(root, { recursive: true }) }
}

Deno.test('The Session folder is shown with how many Sessions it holds', async () => {
  const f = await fixture()
  const shown = await (await f.call('GET', '/api/sessions-folder')).json()
  assertEquals(shown, { inUse: f.old, default: f.old, count: 1 })
  await f.done()
})

Deno.test('Checking a folder counts its Sessions and changes nothing', async () => {
  const f = await fixture()
  const missing = join(f.root, 'new')
  const res = await f.call('POST', '/api/sessions-folder/check', { path: missing })
  assertEquals(await res.json(), { ok: true, path: missing, count: 0, exists: false, same: false })
  assertEquals(f.store.root(), f.old)
  const relative = await f.call('POST', '/api/sessions-folder/check', { path: 'Sessions' })
  assertEquals(relative.status, 400)
  await relative.body?.cancel()
  const file = join(f.root, 'file')
  await Deno.writeTextFile(file, '')
  const notFolder = await f.call('POST', '/api/sessions-folder/check', { path: file })
  assertEquals(notFolder.status, 400)
  await notFolder.body?.cancel()
  await f.done()
})

Deno.test('The folder in use is the same however its path is written', async () => {
  const f = await fixture()
  for (const path of [f.old, `${f.old}/`, '']) {
    const res = await f.call('POST', '/api/sessions-folder/check', { path })
    assertEquals((await res.json()).same, true, path)
  }
  await f.done()
})

Deno.test('Moving applies at once, keeps the choice, and an empty path is the default', async () => {
  const f = await fixture()
  const next = join(f.root, 'new')
  const moved = await f.call('PUT', '/api/sessions-folder', { path: next })
  assertEquals(await moved.json(), { inUse: next, default: f.old, count: 0 })
  assertEquals(f.store.dir('b'), join(next, 'b'))
  await (await f.call('PUT', '/api/sessions-folder', { path: '' })).body?.cancel()
  assertEquals([f.store.root(), f.kept], [f.old, [next, '']])
  await f.done()
})

Deno.test('A move that fails goes back to the folder it was in', async () => {
  const f = await fixture()
  const routes = sessionsFolderRoutes({
    folder: {
      default: f.old,
      inUse: f.store.root,
      moveTo: (path) => Promise.resolve(f.store.moveTo(path)),
    },
    keep: () => Promise.reject(new Error("settings.json can't be written")),
    busy: () => Promise.resolve(false),
  })
  const put = routes.find(([m]) => m === 'PUT')![2]
  const req = new Request('http://x/api/sessions-folder', {
    method: 'PUT',
    body: JSON.stringify({ path: join(f.root, 'new') }),
  })
  await put(req, {}).catch(() => {})
  assertEquals(f.store.root(), f.old)
  await f.done()
})

Deno.test('A folder inside one that is not there is refused', async () => {
  const f = await fixture()
  const res = await f.call('POST', '/api/sessions-folder/check', {
    path: join(f.root, 'no-drive', 'Sessions'),
  })
  assertEquals(res.status, 400)
  await res.body?.cancel()
  await f.done()
})

Deno.test('Moving is refused while work is running', async () => {
  const f = await fixture(true)
  const res = await f.call('PUT', '/api/sessions-folder', { path: join(f.root, 'new') })
  assertEquals(res.status, 409)
  await res.body?.cancel()
  assertEquals(f.store.root(), f.old)
  await f.done()
})

Deno.test('The folder dialog gives the path chosen', async () => {
  const f = await fixture()
  const res = await f.call('POST', '/api/sessions-folder/pick')
  assertEquals(await res.json(), { path: '/picked' })
  await f.done()
})
