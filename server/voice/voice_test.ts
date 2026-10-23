import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { withTempDir } from '../testing.ts'
import { voiceService } from './voice.ts'

/**
 * A stand-in voice service: answers health checks, takes only JSON as the real one does, and goes
 * away when asked (`stop`).
 */
const STUB = `
const port = Number(Deno.args[0])
Deno.serve({ port, hostname: '127.0.0.1', onListen() {} }, (req) => {
  const path = new URL(req.url).pathname
  if (path === '/quit') setTimeout(() => Deno.exit(0), 50)
  if (path === '/health') return Response.json({ ok: true })
  return req.headers.get('content-type') === 'application/json'
    ? Response.json({ seconds: 0 })
    : Response.json({ error: 'Send JSON' }, { status: 415 })
})
`

/** Stops a stand-in voice service (portable, unlike `pkill`) and waits for it to go. */
async function stop(port: number) {
  await (await fetch(`http://127.0.0.1:${port}/quit`)).body?.cancel()
  await new Promise((r) => setTimeout(r, 300))
}

Deno.test('The voice service is started on first use, and again if it has gone away', () =>
  withTempDir(async (dir) => {
    const stub = join(dir, 'stub.ts')
    await Deno.writeTextFile(stub, STUB)
    const port = 18800 + Math.floor(Math.random() * 500)
    const started: number[] = []
    const voice = voiceService({
      root: dir,
      port,
      startLimitMs: 20_000,
      command: (p) => (started.push(p), ['deno', 'run', '--allow-net', stub, String(p)]),
    })
    const signal = new AbortController().signal
    const req = { text: 'Hi.', ref: '/r.wav', refText: 'Ref.', seed: 1, out: '/o.wav' }

    await voice.speak(req, signal)
    assertEquals(started.length, 1)
    await voice.speak(req, signal)
    assertEquals(started.length, 1)

    // It goes away (here: stopped); the next call starts it again and succeeds.
    await stop(port)
    await voice.speak(req, signal)
    assertEquals(started.length, 2)
    await stop(port)
  }))

/** A stand-in that downloads for 250 ms on its first request, saying so on /health meanwhile. */
const DOWNLOADING_STUB = `
const port = Number(Deno.args[0])
let downloading = null
Deno.serve({ port, hostname: '127.0.0.1', onListen() {} }, async (req) => {
  const path = new URL(req.url).pathname
  if (path === '/quit') return (setTimeout(() => Deno.exit(0), 50), new Response())
  if (path === '/health') return Response.json({ ok: true, downloading })
  downloading = 'bosonai/higgs-tts-3-4b'
  await new Promise((r) => setTimeout(r, 250))
  downloading = null
  await new Promise((r) => setTimeout(r, 150))
  return Response.json({ seconds: 0 })
})
`

Deno.test('While the voice service downloads a model, the caller hears of it, then that it is done', () =>
  withTempDir(async (dir) => {
    const stub = join(dir, 'stub.ts')
    await Deno.writeTextFile(stub, DOWNLOADING_STUB)
    const port = 18800 + Math.floor(Math.random() * 500)
    const voice = voiceService({
      root: dir,
      port,
      startLimitMs: 20_000,
      checkEveryMs: 50,
      command: (p) => ['deno', 'run', '--allow-net', stub, String(p)],
    })
    const seen: boolean[] = []
    const req = { text: 'Hi.', ref: '/r.wav', refText: 'Ref.', seed: 1, out: '/o.wav' }
    await voice.speak(req, new AbortController().signal, (d) => seen.push(d))
    assertEquals(seen, [true, false])
    await stop(port)
  }))
