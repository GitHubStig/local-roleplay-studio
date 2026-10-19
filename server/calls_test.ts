import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import {
  callFile,
  type CallRecord,
  logCalls,
  logCallsUnder,
  loggedChat,
  loggedEmbedder,
  loggedMaker,
  loggedVoice,
  makeRoomInCallLogs,
  renumberCallLogs,
} from './calls.ts'
import type { SceneMaker } from './3d/scene.ts'
import type { Chat, ChatCall } from './text/chat.ts'
import { withTempDir } from './testing.ts'

const signal = new AbortController().signal

/** A Chat answering `{"line":"…"}` with the user's message, or failing on "fail". */
const echo: Chat = {
  model: 'echo',
  thinks: false,
  stream: (call: ChatCall) => {
    const said = call.messages.at(-1)!.content
    if (said === 'fail') return Promise.reject(new Error('It failed'))
    return Promise.resolve({ content: JSON.stringify({ line: said }), thinking: '' })
  },
}

const ask = (chat: Chat, content: string) =>
  chat.stream({
    messages: [{ role: 'user', content }],
    schema: { type: 'object' },
    maxTokens: 10,
    job: 'reply',
    signal,
  })

const exists = (path: string) =>
  Deno.stat(path).then(() => true, (err) => {
    if (err instanceof Deno.errors.NotFound) return false
    throw err
  })

const read = async (path: string): Promise<CallRecord[]> =>
  JSON.parse(await Deno.readTextFile(path))

Deno.test('Calls are logged in their Frame’s file, oldest first, as a JSON array', async () => {
  await withTempDir(async (dir) => {
    const chat = loggedChat(echo)
    await logCalls(true, dir, 2, async () => {
      await ask(chat, 'one')
      await ask(chat, 'two')
    })
    const calls = await read(join(dir, 'calls', 'frame-3.json'))
    assertEquals(calls.map((c) => c.response?.reply), [{ line: 'one' }, { line: 'two' }])
    assertEquals(calls[0].job, 'reply')
    assertEquals(calls[0].model, 'echo')
    assertEquals(calls[0].request.messages, [{ role: 'user', content: 'one' }])
  })
})

Deno.test('Calls that are no Frame’s go in setup.json, and logCallsUnder moves them', async () => {
  await withTempDir(async (dir) => {
    const chat = loggedChat(echo)
    await logCalls(true, dir, null, async () => {
      await ask(chat, 'cast')
      await logCallsUnder(0, () => ask(chat, 'suggest'))
    })
    assertEquals((await read(callFile(dir, null))).length, 1)
    assertEquals((await read(callFile(dir, 0))).length, 1)
  })
})

Deno.test('Calls made at once are all logged', async () => {
  await withTempDir(async (dir) => {
    const chat = loggedChat(echo)
    await logCalls(true, dir, 0, () => Promise.all(['a', 'b', 'c'].map((s) => ask(chat, s))))
    assertEquals((await read(callFile(dir, 0))).length, 3)
  })
})

Deno.test('A failed call is logged with its error', async () => {
  await withTempDir(async (dir) => {
    await assertRejects(() => logCalls(true, dir, 0, () => ask(loggedChat(echo), 'fail')))
    const [call] = await read(callFile(dir, 0))
    assertEquals(call.error, 'It failed')
    assertEquals(call.response, undefined)
  })
})

Deno.test('Nothing is logged when the log is off, or outside a piece of work', async () => {
  await withTempDir(async (dir) => {
    const chat = loggedChat(echo)
    await logCalls(false, dir, 0, () => ask(chat, 'off'))
    await ask(chat, 'outside')
    assertEquals(await exists(join(dir, 'calls')), false)
  })
})

Deno.test('A Session removed meanwhile gets no folder back', async () => {
  await withTempDir(async (dir) => {
    const gone = join(dir, 'gone')
    await logCalls(true, gone, 0, () => ask(loggedChat(echo), 'hi'))
    assertEquals(await exists(gone), false)
  })
})

Deno.test('A deleted Frame’s calls are kept aside, and later Frames’ numbered down', () =>
  withTempDir(async (dir) => {
    await renumberCallLogs(dir, 1) // No log: nothing to do.
    await Deno.mkdir(join(dir, 'calls'))
    for (const index of [0, 1, 2, 3]) await Deno.writeTextFile(callFile(dir, index), `${index}`)
    await Deno.writeTextFile(join(dir, 'calls', 'setup.json'), 'setup')
    await renumberCallLogs(dir, 1)
    const files = (await Array.fromAsync(Deno.readDir(join(dir, 'calls')))).map((e) => e.name)
    const aside = files.find((f) => f.startsWith('frame-2-deleted-'))!
    assertEquals(files.filter((f) => f !== aside).sort(), [
      'frame-1.json',
      'frame-2.json',
      'frame-3.json',
      'setup.json',
    ])
    const read = (file: string) => Deno.readTextFile(join(dir, 'calls', file))
    assertEquals(
      await Promise.all(['frame-1.json', 'frame-2.json', 'frame-3.json', aside].map(read)),
      ['0', '2', '3', '1'],
    )
  }))

Deno.test('Voices, 3D and style scores are logged: files by name, embeddings counted', () =>
  withTempDir(async (dir) => {
    const voice = loggedVoice({
      profile: () => Promise.resolve({ ref: 'wav', speech: 'mp3', heavy: false }),
      design: () => Promise.resolve(),
      speak: () => Promise.resolve(),
    }, 'comfyui')
    const scene = loggedMaker<SceneMaker>(
      {
        make: () => Promise.resolve({ splats: 9, pivot: 2, fov: 40, aspect: 1 }),
      },
      'scene',
      'SHARP',
    )
    const style = loggedEmbedder({
      embed: () => Promise.resolve({ images: { '/a/x.png': { csd: 'c', clip: 'v' } }, texts: {} }),
    })
    await logCalls(true, dir, 1, async () => {
      await voice.speak(
        { text: 'Hello.', ref: '/s/voice.wav', refText: 'Hi.', seed: 1, out: '/s/frame-1.mp3' },
        signal,
      )
      await scene.make({ image: '/s/frame-1-aaaa.png', out: '/s/scene-1.ply' }, signal)
      await style.embed({ images: ['/a/x.png'], texts: [] }, signal)
    })
    const calls = await read(callFile(dir, 1))
    assertEquals(calls.map((c) => [c.job, c.model]), [
      ['speak', 'comfyui'],
      ['scene', 'SHARP'],
      ['style', 'style embedder'],
    ])
    assertEquals(calls[0].request, { text: 'Hello.', refText: 'Hi.', seed: 1, ref: 'voice.wav' })
    assertEquals(calls[0].response, { file: 'frame-1.mp3' })
    assertEquals(calls[1].response, {
      file: 'scene-1.ply',
      splats: 9,
      pivot: 2,
      fov: 40,
      aspect: 1,
    })
    assertEquals(calls[2].response, { images: 1, texts: 0 })
  }))

Deno.test('A Frame added makes room in the call log: later Frames’ numbered up', () =>
  withTempDir(async (dir) => {
    await makeRoomInCallLogs(dir, 1) // No log: nothing to do.
    await Deno.mkdir(join(dir, 'calls'))
    for (const index of [0, 1, 2]) await Deno.writeTextFile(callFile(dir, index), `${index}`)
    await makeRoomInCallLogs(dir, 1)
    const read = (index: number) => Deno.readTextFile(callFile(dir, index)).catch(() => null)
    assertEquals(await Promise.all([0, 1, 2, 3].map(read)), ['0', null, '1', '2'])
  }))
