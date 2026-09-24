import { assertEquals } from 'jsr:@std/assert@1'
import { handler } from './app.ts'

Deno.test('GET /api/health reports ok', async () => {
  const res = handler(new Request('http://localhost/api/health'))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { ok: true })
})

Deno.test('unknown routes return 404', () => {
  const res = handler(new Request('http://localhost/api/nope'))
  assertEquals(res.status, 404)
})
