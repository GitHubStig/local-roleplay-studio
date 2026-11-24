import { folderCheckIn, getSessionsFolder, pickedIn, sessionsFolderIn } from './appTesting.ts'
import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { dirSessionStore } from './session.ts'
import { type SessionsFolder, sessionsFolderRoutes } from './sessionsFolder.ts'

async function fixture(busy = false, here = true) {
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
  /** What Settings keep: each save's folder in use, and the folders remembered now. */
  const kept: string[] = []
  let remembered: string[] = []
  const routes = sessionsFolderRoutes({
    folder,
    remembered: () => Promise.resolve(remembered),
    keep: (path, folders) => {
      kept.push(path)
      remembered = folders
      return Promise.resolve()
    },
    busy: () => Promise.resolve(busy),
    pick: () => Promise.resolve('/picked'),
    os: 'darwin',
    here: () => here,
  })
  const call = (method: string, path: string, body?: unknown) => {
    const url = new URL(`http://x${path}`)
    const [, , handle] = routes.find(([m, p]) => m === method && p.test(url))!
    return handle(
      new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
      {},
    )
  }
  return {
    root,
    old,
    store,
    kept,
    remembered: () => remembered,
    call,
    done: () => Deno.remove(root, { recursive: true }),
  }
}

Deno.test('The Session folder is shown with how many Sessions it holds', async () => {
  const f = await fixture()
  const shown = await getSessionsFolder(f.call)
  assertEquals(shown, {
    inUse: f.old,
    default: f.old,
    count: 1,
    folders: [{ path: f.old, count: 1, default: true }],
    here: true,
    os: 'mac',
  })
  await f.done()
})

Deno.test('Checking a folder counts its Sessions and changes nothing', async () => {
  const f = await fixture()
  const missing = join(f.root, 'new')
  const res = await f.call('POST', '/api/sessions-folder/check', { path: missing })
  assertEquals(await folderCheckIn(res), {
    ok: true,
    path: missing,
    count: 0,
    exists: false,
    same: false,
  })
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
    const check = await folderCheckIn(res)
    assertEquals(check.ok && check.same, true, path)
  }
  await f.done()
})

Deno.test('Moving applies at once, remembers the folder, and an empty path is the default', async () => {
  const f = await fixture()
  const next = join(f.root, 'new')
  const moved = await sessionsFolderIn(await f.call('PUT', '/api/sessions-folder', { path: next }))
  assertEquals([moved.inUse, moved.count], [next, 0])
  assertEquals(moved.folders, [
    { path: f.old, count: 1, default: true },
    { path: next, count: 0, default: false },
  ])
  assertEquals(f.store.dir('b'), join(next, 'b'))
  await (await f.call('PUT', '/api/sessions-folder', { path: '' })).body?.cancel()
  // Back in the app's own folder, the other is still offered.
  assertEquals([f.store.root(), f.kept, f.remembered()], [f.old, [next, ''], [next]])
  await f.done()
})

Deno.test('A folder used again comes first, and one not there is offered as not connected', async () => {
  const f = await fixture()
  const [one, two] = [join(f.root, 'one'), join(f.root, 'two')]
  for (const path of [one, two, one]) {
    await (await f.call('PUT', '/api/sessions-folder', { path })).body?.cancel()
  }
  assertEquals(f.remembered(), [one, two])
  await Deno.remove(two)
  const shown = await getSessionsFolder(f.call)
  assertEquals(shown.folders.map((k) => [k.path, k.count]), [[f.old, 1], [one, 0], [two, null]])
  await f.done()
})

Deno.test('Forget stops offering a folder, but not the one in use or the default', async () => {
  const f = await fixture()
  const [one, two] = [join(f.root, 'one'), join(f.root, 'two')]
  for (const path of [one, two]) {
    await (await f.call('PUT', '/api/sessions-folder', { path })).body?.cancel()
  }
  const forgot = await f.call('POST', '/api/sessions-folder/forget', { path: one })
  assertEquals((await sessionsFolderIn(forgot)).folders.map((k) => k.path), [f.old, two])
  assertEquals(f.kept.at(-1), two)
  for (const path of [two, f.old]) {
    const refused = await f.call('POST', '/api/sessions-folder/forget', { path })
    assertEquals(refused.status, 409)
    await refused.body?.cancel()
  }
  // Its Sessions are where they were.
  assertEquals((await Deno.stat(one)).isDirectory, true)
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
    remembered: () => Promise.resolve([]),
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
  assertEquals(await pickedIn(res), { path: '/picked' })
  await f.done()
})

Deno.test("The folder dialog is refused to a browser away from the server's machine", async () => {
  const f = await fixture(false, false)
  const res = await f.call('POST', '/api/sessions-folder/pick')
  assertEquals(res.status, 409)
  await res.body?.cancel()
  assertEquals((await getSessionsFolder(f.call)).here, false)
  await f.done()
})

Deno.test('A folder remembered twice, written two ways, is offered once', async () => {
  const f = await fixture()
  const one = join(f.root, 'one')
  await (await f.call('PUT', '/api/sessions-folder', { path: one })).body?.cancel()
  await (await f.call('PUT', '/api/sessions-folder', { path: '' })).body?.cancel()
  // As if settings.json were edited by hand.
  f.remembered().push(`${one}/`)
  const shown = await getSessionsFolder(f.call)
  assertEquals(shown.folders.map((k) => k.path), [f.old, one])
  await f.done()
})
