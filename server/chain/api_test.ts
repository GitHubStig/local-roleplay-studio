import { assertEquals, assertMatch } from '@std/assert'
import {
  fakeImageGenerator,
  promptWith,
  reply,
  scriptedTextModel,
  withTempDir,
} from '../testing.ts'
import { type JsonFrame, readEvents, settled, setup, shown } from '../appTesting.ts'

/** A Text Model whose Frames never come: each waits until its call is cancelled. */
const hangingTextModel = () => ({
  ...scriptedTextModel([]),
  write: (_req: unknown, signal: AbortSignal) =>
    new Promise<never>((_, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    ),
})

Deno.test('Frames stream progress and commit, then their render jobs serve their image', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })

    const opening = await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    assertEquals(opening.map(([e]) => e), ['phase', 'committed'])
    // Its picture comes from a render job, queued as it was saved (ADR 0030).
    const [render] = await (await call('GET', '/api/sessions/s1/jobs')).json()
    assertEquals([render.kind, render.frameIndex], ['render', 0])

    assertEquals((await call('POST', '/api/sessions/s1/frames', {})).status, 400)
    const second = await readEvents(
      await call('POST', '/api/sessions/s1/frames', { action: 'Sit' }),
    )
    assertEquals(second.at(-1)![1].frame, {
      ...(second.at(-1)![1].frame as object),
      index: 1,
      action: 'Sit',
    })

    assertEquals(await settled(call), [])
    const session = await (await call('GET', '/api/sessions/s1')).json()
    const [firstImage, secondImage] = session.frames.map((t: JsonFrame) => shown(t).image)
    assertMatch(firstImage, /^frame-0-[0-9a-f]{8}\.png$/)

    const image = await call('GET', `/api/sessions/s1/images/${secondImage}`)
    assertEquals(image.headers.get('Content-Type'), 'image/png')
    assertEquals(await image.text(), promptWith('sitting'))
    assertEquals((await call('GET', '/api/sessions/s1/images/session.json')).status, 404)
  }))

Deno.test('A failed Opening Frame discards the Session; a failed render of it leaves it', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([new Error('Ollama down'), new Error('Ollama down')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    const events = await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    assertEquals(events.at(-1), [
      'failed',
      { type: 'failed', message: 'Ollama down', sessionDiscarded: true },
    ])
    assertEquals((await call('GET', '/api/sessions/s1')).status, 404)

    const rendering = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing')]),
      imageGenerator: fakeImageGenerator({ fail: true }),
    })
    await rendering.call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await rendering.call('POST', '/api/sessions/s1/frames', {}))
    const [failed] = await settled(rendering.call)
    assertEquals([failed.kind, failed.error], ['render', 'mflux crashed'])
    const session = await (await rendering.call('GET', '/api/sessions/s1')).json()
    assertEquals(session.frames.length, 1)
  }))

Deno.test('Cancel aborts the Frame in progress and rejects overlapping Frames', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: hangingTextModel(),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    const res = await call('POST', '/api/sessions/s1/frames', {})
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
    let seen = ''
    while (!seen.includes('"phase":"text"')) seen += (await reader.read()).value

    assertEquals((await call('POST', '/api/sessions/s1/frames', {})).status, 409)
    assertEquals((await call('POST', '/api/sessions/s1/cancel')).status, 204)

    let rest = ''
    for (let r = await reader.read(); !r.done; r = await reader.read()) rest += r.value
    assertEquals(rest.includes('event: cancelled'), true)
    assertEquals(rest.includes('"sessionDiscarded":true'), true)
  }))

Deno.test('A render in progress serves its latest preview while Settings show it, then none', () =>
  withTempDir(async (root) => {
    const { call, settings } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing')]),
      imageGenerator: fakeImageGenerator({ hang: true }),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    assertEquals((await call('GET', '/api/sessions/s1/preview')).status, 404)
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    // The Opening's render job: its phase comes just before it renders and sends its first preview.
    let job = (await (await call('GET', '/api/sessions/s1/jobs')).json())[0]
    while (job.phase !== 'image') {
      await new Promise((r) => setTimeout(r, 5))
      job = (await (await call('GET', '/api/sessions/s1/jobs')).json())[0]
    }
    let preview = await call('GET', '/api/sessions/s1/preview?step=1')
    while (preview.status === 404) {
      await preview.body?.cancel()
      await new Promise((r) => setTimeout(r, 5))
      preview = await call('GET', '/api/sessions/s1/preview?step=1')
    }
    assertEquals(preview.headers.get('content-type'), 'image/jpeg')
    assertEquals([...new Uint8Array(await preview.arrayBuffer())], [255, 216, 255])
    await settings.save({ ...await settings.load(), previews: false })
    assertEquals((await call('GET', '/api/sessions/s1/preview')).status, 404)
    await settings.save({ ...await settings.load(), previews: true })

    await call('DELETE', `/api/sessions/s1/jobs/${job.id}`)
    await settled(call)
    assertEquals((await call('GET', '/api/sessions/s1/preview')).status, 404)
  }))

Deno.test('DELETE /api/sessions/:id/frames/:index undoes from a Frame on, as the latest Frame was seen', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Sit' }))

    assertEquals((await call('DELETE', '/api/sessions/s1/frames/0?latest=1')).status, 409)
    assertEquals((await call('DELETE', '/api/sessions/s1/frames/x?latest=1')).status, 400)
    assertEquals((await call('DELETE', '/api/sessions/s1/frames/1')).status, 400)
    const res = await call('DELETE', '/api/sessions/s1/frames/1?latest=1')
    assertEquals(res.status, 200)
    assertEquals((await res.json()).frames.length, 1)
    assertEquals((await call('DELETE', '/api/sessions/s1/frames/1?latest=1')).status, 409)
    assertEquals((await call('DELETE', '/api/sessions/s1/frames/0?latest=0')).status, 409)
    await settled(call)
  }))

Deno.test('Undo is refused while a Frame is in progress', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: hangingTextModel(),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    const res = await call('POST', '/api/sessions/s1/frames', {})
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
    let seen = ''
    while (!seen.includes('"phase":"text"')) seen += (await reader.read()).value
    assertEquals((await call('DELETE', '/api/sessions/s1/frames/0?latest=0')).status, 409)
    await call('POST', '/api/sessions/s1/cancel')
    for (let r = await reader.read(); !r.done; r = await reader.read()) { /* drain */ }
  }))

Deno.test('Chain Frames render one at a time across Sessions; a waiting render is queued', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting')]),
      imageGenerator: fakeImageGenerator({ hang: true }),
    })
    const renderOf = async (id: string) =>
      (await (await call('GET', `/api/sessions/${id}/jobs`)).json())[0]
    const phaseOf = async (id: string, phase: string) => {
      let job = await renderOf(id)
      while (job.phase !== phase) {
        await new Promise((r) => setTimeout(r, 5))
        job = await renderOf(id)
      }
      return job
    }
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    const a = await phaseOf('s1', 'image')
    await readEvents(await call('POST', '/api/sessions/s2/frames', {}))
    const b = await phaseOf('s2', 'queued')

    // Cancelling A's render lets B's start.
    await call('DELETE', `/api/sessions/s1/jobs/${a.id}`)
    await phaseOf('s2', 'image')
    await call('DELETE', `/api/sessions/s2/jobs/${b.id}`)
    await settled(call, 's1')
    await settled(call, 's2')
  }))

Deno.test('Two Frames sent at once for one Session: only one runs', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting'), reply('kneeling')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))

    const [a, b] = await Promise.all([
      call('POST', '/api/sessions/s1/frames', { action: 'Sit' }),
      call('POST', '/api/sessions/s1/frames', { action: 'Kneel' }),
    ])
    assertEquals([a.status, b.status].sort(), [200, 409])
    await readEvents(a.status === 200 ? a : b)
    await (a.status === 200 ? b : a).body?.cancel()

    await settled(call)
    const session = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(session.frames.map((t: { index: number }) => t.index), [0, 1])
  }))

Deno.test('Undo and a Frame sent at once never bring back the undone Frame', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([reply('standing'), reply('sitting'), reply('kneeling')]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Sit' }))

    const [undo, frame] = await Promise.all([
      call('DELETE', '/api/sessions/s1/frames/1?latest=1'),
      call('POST', '/api/sessions/s1/frames', { action: 'Kneel' }),
    ])
    if (frame.status === 200) await readEvents(frame)
    else await frame.body?.cancel()
    assertEquals([undo.status, frame.status].includes(409), true)

    // Whatever won, every Frame is numbered in order and its image exists.
    await settled(call)
    const session = await (await call('GET', '/api/sessions/s1')).json()
    session.frames.forEach((t: { index: number }, i: number) => assertEquals(t.index, i))
    for (const t of session.frames as JsonFrame[]) {
      assertEquals((await call('GET', `/api/sessions/s1/images/${shown(t).image}`)).status, 200)
    }
  }))

Deno.test('A Session is free again after a Frame, a failed Frame, an early refusal and an Undo', () =>
  withTempDir(async (root) => {
    const { call } = setup({
      root,
      settings: { textModel: 'x' },
      textModel: scriptedTextModel([
        reply('standing'),
        new Error('bad reply'),
        new Error('bad again'),
        reply('sitting'),
        reply('kneeling'),
      ]),
    })
    await call('POST', '/api/sessions', { scenarioId: 'test' })
    await readEvents(await call('POST', '/api/sessions/s1/frames', {}))
    const failed = await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'A' }))
    assertEquals(failed.at(-1)![0], 'failed')
    assertEquals((await call('POST', '/api/sessions/s1/frames', {})).status, 400)
    await readEvents(await call('POST', '/api/sessions/s1/frames', { action: 'Sit' }))
    assertEquals((await call('DELETE', '/api/sessions/s1/frames/1?latest=1')).status, 200)
    const last = await readEvents(
      await call('POST', '/api/sessions/s1/frames', { action: 'Kneel' }),
    )
    assertEquals(last.at(-1)![0], 'committed')
    await settled(call)
    assertEquals((await call('DELETE', '/api/sessions/s1')).status, 204)
  }))
