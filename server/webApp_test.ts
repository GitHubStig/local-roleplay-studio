import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { setup } from './appTesting.ts'
import { withTempDir } from './testing.ts'
import { webApp } from './webApp.ts'

/** A built web app: its page and one of Vite's files. */
async function built(root: string) {
  const dir = join(root, 'dist')
  await Deno.mkdir(join(dir, 'assets'), { recursive: true })
  await Deno.writeTextFile(join(dir, 'index.html'), '<div id="app"></div>')
  await Deno.writeTextFile(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)')
  return setup({ web: webApp(dir) })
}

Deno.test("The app's own addresses open its page, which is checked each time", () =>
  withTempDir(async (dir) => {
    const { call } = await built(dir)
    for (const path of ['/', '/settings/images', '/roleplay/20261120-101010-abcd', '/queue']) {
      const res = await call('GET', path)
      assertEquals([res.status, await res.text()], [200, '<div id="app"></div>'], path)
      assertEquals(res.headers.get('Cache-Control'), 'no-cache')
    }
  }))

Deno.test("Vite's files are served, kept for good, and a missing one isn't the page", () =>
  withTempDir(async (dir) => {
    const { call } = await built(dir)
    const js = await call('GET', '/assets/index-abc123.js')
    assertEquals([js.status, await js.text()], [200, 'console.log(1)'])
    assertEquals(js.headers.get('Cache-Control'), 'public, max-age=31536000, immutable')
    const missing = await call('GET', '/assets/index-gone.js')
    assertEquals(missing.status, 404)
    await missing.body?.cancel()
    // Nothing beside the build, however the way up is spelt.
    await Deno.writeTextFile(join(dir, 'secret.json'), 'SECRET')
    for (const path of ['/..%2fsecret.json', '/%2e%2e/secret.json', '/..%5csecret.json']) {
      const res = await call('GET', path)
      assertEquals((await res.text()).includes('SECRET'), false, path)
      assertEquals(res.status === 200, false, path)
    }
  }))

Deno.test('An unknown API address is still a 404 of its own', () =>
  withTempDir(async (dir) => {
    const { call } = await built(dir)
    const res = await call('GET', '/api/nope')
    assertEquals([res.status, await res.json()], [404, { error: 'Not found' }])
    assertEquals(await (await call('GET', '/api/health')).json(), { ok: true })
  }))

Deno.test('Without a build, a page says how to make one', () =>
  withTempDir(async (dir) => {
    const { call } = setup({ web: webApp(join(dir, 'dist')) })
    const res = await call('GET', '/settings')
    assertEquals(res.status, 503)
    assertEquals((await res.text()).includes('deno task build'), true)
  }))
