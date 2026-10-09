import { assertEquals } from '@std/assert'
import { runWorkflow } from './client.ts'
import { fakeComfyUI } from './testing.ts'

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
