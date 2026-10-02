import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { withTempDir } from './testing.ts'
import { voiceService } from './voice.ts'

/** A stand-in voice service: answers health checks, and counts what it's asked to speak. */
const STUB = `
const port = Number(Deno.args[0])
Deno.serve({ port, hostname: '127.0.0.1', onListen() {} }, (req) =>
  new URL(req.url).pathname === '/health' ? Response.json({ ok: true }) : Response.json({ seconds: 0 }))
`

Deno.test('The voice service is started on first use, and again if it has gone away', () =>
  withTempDir(async (dir) => {
    const stub = join(dir, 'stub.ts')
    await Deno.writeTextFile(stub, STUB)
    const port = 18800 + Math.floor(Math.random() * 500)
    const started: number[] = []
    const voice = voiceService({
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

    // It goes away (here: killed); the next call starts it again and succeeds.
    await new Deno.Command('pkill', { args: ['-f', `${stub} ${port}`] }).output()
    await new Promise((r) => setTimeout(r, 300))
    await voice.speak(req, signal)
    assertEquals(started.length, 2)
    await new Deno.Command('pkill', { args: ['-f', `${stub} ${port}`] }).output()
  }))

/** A stand-in that downloads for 2.5 s on its first request, saying so on /health meanwhile. */
const DOWNLOADING_STUB = `
const port = Number(Deno.args[0])
let downloading = null
Deno.serve({ port, hostname: '127.0.0.1', onListen() {} }, async (req) => {
  if (new URL(req.url).pathname === '/health') return Response.json({ ok: true, downloading })
  downloading = 'bosonai/higgs-tts-3-4b'
  await new Promise((r) => setTimeout(r, 2500))
  downloading = null
  await new Promise((r) => setTimeout(r, 1500))
  return Response.json({ seconds: 0 })
})
`

Deno.test('While the voice service downloads a model, the caller hears of it, then that it is done', () =>
  withTempDir(async (dir) => {
    const stub = join(dir, 'stub.ts')
    await Deno.writeTextFile(stub, DOWNLOADING_STUB)
    const port = 18800 + Math.floor(Math.random() * 500)
    const voice = voiceService({
      port,
      startLimitMs: 20_000,
      command: (p) => ['deno', 'run', '--allow-net', stub, String(p)],
    })
    const seen: boolean[] = []
    const req = { text: 'Hi.', ref: '/r.wav', refText: 'Ref.', seed: 1, out: '/o.wav' }
    await voice.speak(req, new AbortController().signal, (d) => seen.push(d))
    assertEquals(seen, [true, false])
    await new Deno.Command('pkill', { args: ['-f', `${stub} ${port}`] }).output()
  }))
