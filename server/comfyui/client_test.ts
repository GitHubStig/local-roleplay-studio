import { assertEquals, assertRejects } from '@std/assert'
import { runWorkflow, upload } from './client.ts'
import { fakeComfyUI, halfOpenProxy } from './testing.ts'
import { type ComfyTrace, notingTraces } from './traces.ts'

const GB = 1024 ** 3

Deno.test('A job ends once ComfyUI has let go of the GPU, so the next one finds it free', async () => {
  // 10 GB free before; the model still loaded for a few asks after the job, then unloaded.
  const comfy = fakeComfyUI({ vramFree: [10 * GB, 2 * GB, 2 * GB, 2 * GB, 9.8 * GB] })
  try {
    const { png } = await runWorkflow(comfy.url, {}, new AbortController().signal, 15_000)
    assertEquals(png?.length, 4)
    // Asked before, then until it was back near where it was.
    assertEquals(comfy.stats, [10 * GB, 2 * GB, 2 * GB, 2 * GB, 9.8 * GB])
    assertEquals(comfy.posted.map((p) => p.path), ['(in history)', '/history', '/free'])
  } finally {
    await comfy.close()
  }
})

Deno.test("A ComfyUI that doesn't say what's free isn't waited on", async () => {
  const comfy = fakeComfyUI()
  try {
    const started = performance.now()
    await runWorkflow(comfy.url, {}, new AbortController().signal, 15_000)
    assertEquals(performance.now() - started < 1000, true)
  } finally {
    await comfy.close()
  }
})

Deno.test('Previews are asked for only by a caller that takes them, and passed on', async () => {
  const comfy = fakeComfyUI()
  try {
    await runWorkflow(comfy.url, {}, new AbortController().signal, 15_000)
    const previews: number[][] = []
    const { png } = await runWorkflow(
      comfy.url,
      {},
      new AbortController().signal,
      15_000,
      undefined,
      (jpeg) => previews.push([...jpeg]),
    )
    assertEquals(comfy.extras, [undefined, { preview_method: 'latent2rgb' }])
    // The JPEG preview, then the PNG as the picture.
    assertEquals(previews, [[255, 216, 255]])
    assertEquals(png?.length, 4)
  } finally {
    await comfy.close()
  }
})

Deno.test('A prompt ComfyUI reports, even to its end, before saying it was queued is followed', async () => {
  const comfy = fakeComfyUI({ steps: 3, reportsFirst: true })
  try {
    const started = performance.now()
    const steps: number[] = []
    const { png } = await runWorkflow(
      comfy.url,
      {},
      new AbortController().signal,
      15_000,
      (step) => steps.push(step),
    )
    assertEquals([png?.length, steps], [4, [1, 2, 3]])
    // Its end was heard too, rather than waited for (10 s).
    assertEquals(comfy.posted.map((p) => p.path), ['(in history)', '/history', '/free'])
    assertEquals(performance.now() - started < 1000, true)
  } finally {
    await comfy.close()
  }
})

Deno.test('A prompt queued and a file uploaded are told to the work noting them', async () => {
  const comfy = fakeComfyUI()
  try {
    const traces: ComfyTrace[] = []
    await notingTraces((t) => traces.push(t), async () => {
      await upload(comfy.url, 'rpg-1.png', new Uint8Array([1]))
      await runWorkflow(comfy.url, {}, new AbortController().signal, 15_000)
    })
    assertEquals(traces, [
      { upload: { base: comfy.url, file: { filename: 'rpg-1.png', subfolder: '', type: 'temp' } } },
      { prompt: { base: comfy.url, promptId: 'p1' } },
    ])
  } finally {
    await comfy.close()
  }
})

Deno.test('A job whose WebSocket went half-open, as after a sleep, fails once ComfyUI no longer has it', async () => {
  // ComfyUI runs and finishes the prompt as usual; its messages, the picture among them, reach no
  // one, and the prompt leaves its queue. /system_stats still answers, so only the queue tells.
  const comfy = fakeComfyUI()
  const proxy = halfOpenProxy(comfy.url)
  try {
    const started = performance.now()
    await assertRejects(
      () => runWorkflow(proxy.url, {}, new AbortController().signal, 100),
      Error,
      'ComfyUI no longer has this job',
    )
    // Four checks without it, not the whole wait.
    assertEquals(performance.now() - started < 2000, true)
    assertEquals(comfy.posted.find((p) => p.path === '/history')?.body, { delete: ['p1'] })
  } finally {
    await proxy.close()
    await comfy.close()
  }
})
