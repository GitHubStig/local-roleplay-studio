/**
 * Run before every web test file (`vite.config.ts`). A test never reaches a server: a request it
 * didn't mock is refused here, at once, and fails the test that sent it, naming it. Otherwise
 * happy-dom sends it to `localhost:3000`, where it fails slowly and quietly, or reaches whatever
 * happens to be listening there.
 */
import { afterEach, beforeEach, vi } from 'vitest'

let unmocked: string[] = []

beforeEach(() => {
  unmocked = []
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    unmocked.push(`${init?.method ?? 'GET'} ${url}`)
    return Promise.reject(new TypeError(`A test sent ${url} without mocking it`))
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (unmocked.length) throw new Error(`The test sent without mocking: ${unmocked.join(', ')}`)
})
