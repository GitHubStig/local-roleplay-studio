import { assertEquals } from '@std/assert'
import { clearTraces } from './files.ts'
import { withTrace } from './traces.ts'

Deno.test('A trace is kept once', () => {
  const prompt = { prompt: { base: 'http://pc', promptId: 'p1' } }
  const upload = {
    upload: { base: 'http://pc', file: { filename: 'rpg-1.png', subfolder: '', type: 'temp' } },
  }
  const traces = withTrace(withTrace(withTrace(undefined, prompt), upload), prompt)
  assertEquals(withTrace(traces, upload), {
    prompts: [prompt.prompt],
    uploads: [upload.upload],
  })
})

Deno.test('After a restart, a prompt cut off is stopped, its outputs and uploads blanked, its history deleted', async () => {
  const posted: string[] = []
  const blanked: string[] = []
  let running = true
  const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    const path = new URL(req.url).pathname
    if (req.method === 'GET' && path === '/queue') {
      return Response.json({ queue_running: running ? [[0, 'p1']] : [], queue_pending: [] })
    }
    if (req.method === 'GET' && path === '/history/p1') {
      // Written once the prompt has stopped, as ComfyUI does.
      return Response.json(
        running ? {} : {
          p1: {
            outputs: {
              out: { images: [{ filename: 'clip-1.mp4', subfolder: 'video', type: 'output' }] },
              '9': { text: ['not a file'] },
            },
          },
        },
      )
    }
    if (path === '/upload/image') {
      const form = await req.formData()
      const image = form.get('image') as File
      blanked.push(`${form.get('type')}:${form.get('subfolder')}/${image.name}:${image.size}`)
      return Response.json({ name: image.name })
    }
    posted.push(path)
    await req.body?.cancel()
    if (path === '/interrupt') running = false
    return new Response(null)
  })
  try {
    const base = `http://127.0.0.1:${server.addr.port}`
    await clearTraces(
      {
        prompts: [{ base, promptId: 'p1' }],
        uploads: [{ base, file: { filename: 'rpg-1.png', subfolder: '', type: 'temp' } }],
      },
      2000,
      5,
    )
    assertEquals(posted, ['/queue', '/interrupt', '/history'])
    // The clip emptied; the uploaded picture a blank 1×1 PNG.
    assertEquals(blanked[0], 'output:video/clip-1.mp4:0')
    assertEquals(blanked[1].startsWith('temp:/rpg-1.png:'), true)
    assertEquals(blanked.length, 2)
  } finally {
    await server.shutdown()
  }
})
