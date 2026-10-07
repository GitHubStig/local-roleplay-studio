import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { DEFAULT_SETTINGS, type Settings } from '../../settings.ts'
import { withTempDir } from '../../testing.ts'
import { comfyuiImageGenerator, comfyuiStatus } from './comfyui.ts'
import { COMFYUI_MODELS, COMFYUI_UPSCALERS } from './models.ts'
import { fillWorkflow, loadWorkflow, pickFiles } from './workflow.ts'

const MAC_FILES: Record<string, string[]> = {
  diffusion_models: [
    'krea2_turbo_fp8_scaled.safetensors',
    'qwen_image_2.1_int8_convrot.safetensors',
  ],
  text_encoders: ['qwen3vl_4b_fp8_scaled.safetensors', 'qwen3vl_8b_int8_convrot.safetensors'],
  vae: ['qwen_image_vae.safetensors', 'qwen_image_2.1_vae_bf16.safetensors'],
}

/**
 * A stand-in ComfyUI: lists `files`, takes a workflow, reports `steps` over the WebSocket, then
 * `finish` ('success', or an error message, or 'hang' until interrupted), and serves the picture.
 */
function fakeComfyUI(
  opts: { files?: Record<string, string[]>; steps?: number; finish?: string } = {},
) {
  const queued: Record<string, unknown>[] = []
  const posted: { path: string; body: unknown }[] = []
  const uploads: { name: string; type: string; overwrite: string; bytes: number }[] = []
  const sockets = new Map<string, WebSocket>()
  const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    const url = new URL(req.url)
    const path = url.pathname
    if (path === '/ws') {
      const { socket, response } = Deno.upgradeWebSocket(req)
      sockets.set(url.searchParams.get('clientId')!, socket)
      return response
    }
    if (path === '/system_stats') {
      return Response.json({ system: { comfyui_version: '0.39.1' }, devices: [{ name: 'mps' }] })
    }
    if (path.startsWith('/models/')) {
      return Response.json((opts.files ?? MAC_FILES)[path.slice('/models/'.length)] ?? [])
    }
    if (path === '/prompt') {
      const body = await req.json()
      queued.push(body.prompt)
      const promptId = 'p1'
      const socket = sockets.get(body.client_id)!
      const send = (type: string, data: object) =>
        socket.send(JSON.stringify({ type, data: { prompt_id: promptId, ...data } }))
      setTimeout(() => {
        for (let i = 1; i <= (opts.steps ?? 2); i++) {
          send('progress', { value: i, max: opts.steps ?? 2 })
        }
        const finish = opts.finish ?? 'success'
        // A sampler preview (a JPEG) and then the picture (a PNG), as binary image messages.
        const image = (format: number, bytes: number[]) =>
          socket.send(new Uint8Array([0, 0, 0, 1, 0, 0, 0, format, ...bytes]))
        image(1, [255, 216, 255])
        if (finish === 'success') {
          image(2, [137, 80, 78, 71])
          send('execution_success', {})
        } else if (finish !== 'hang') {
          send('execution_error', { node_type: 'KSampler', exception_message: finish })
        }
      }, 10)
      return Response.json({ prompt_id: promptId, number: 1, node_errors: {} })
    }
    if (path === '/upload/image') {
      const form = await req.formData()
      const image = form.get('image') as File
      uploads.push({
        name: image.name,
        type: String(form.get('type')),
        overwrite: String(form.get('overwrite')),
        bytes: image.size,
      })
      return Response.json({ name: image.name, subfolder: '', type: form.get('type') })
    }
    if (['/interrupt', '/queue', '/free', '/history'].includes(path)) {
      const body = await req.json()
      posted.push({ path, body })
      if (path === '/interrupt') {
        for (const socket of sockets.values()) {
          socket.send(JSON.stringify({ type: 'execution_interrupted', data: { prompt_id: 'p1' } }))
        }
      }
      return new Response(null, { status: 200 })
    }
    return new Response('not found', { status: 404 })
  })
  return {
    // Not `localhost`: on Windows it tries IPv6 first, and a new connection can take 300 ms or more.
    url: `http://127.0.0.1:${server.addr.port}`,
    queued,
    posted,
    uploads,
    close: () => server.shutdown(),
  }
}

const settings = (url: string, extra: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  imageBackend: 'comfyui',
  imageBaseUrl: url,
  imageModel: 'qwen-image-2.1',
  steps: 25,
  size: 'square',
  ...extra,
})

Deno.test('A ComfyUI render fills the workflow with the installed files, follows its steps and saves the picture', () =>
  withTempDir(async (dir) => {
    const comfy = fakeComfyUI({ steps: 3 })
    try {
      const steps: [number, number][] = []
      const file = await comfyuiImageGenerator().generate(
        {
          prompt: 'Kael at the bar.',
          seed: 7,
          settings: settings(comfy.url),
          dir,
          name: 'frame-0-abc',
        },
        new AbortController().signal,
        (step, total) => steps.push([step, total]),
      )
      assertEquals(file, 'frame-0-abc.png')
      assertEquals(await Deno.readFile(join(dir, file)), new Uint8Array([137, 80, 78, 71]))
      assertEquals(steps, [[1, 3], [2, 3], [3, 3]])
      const [workflow] = comfy.queued as Record<string, { inputs: Record<string, unknown> }>[]
      assertEquals(workflow.unet.inputs.unet_name, 'qwen_image_2.1_int8_convrot.safetensors')
      assertEquals(workflow.clip.inputs.clip_name, 'qwen3vl_8b_int8_convrot.safetensors')
      assertEquals(workflow.vae.inputs.vae_name, 'qwen_image_2.1_vae_bf16.safetensors')
      assertEquals(workflow.text.inputs.prompt, 'Kael at the bar.')
      assertEquals(
        [workflow.sampler.inputs.seed, workflow.sampler.inputs.steps],
        [7, 25],
      )
      assertEquals([workflow.latent.inputs.width, workflow.latent.inputs.height], [1024, 1024])
      // ComfyUI keeps nothing: the prompt leaves its history, and its models are unloaded, as an
      // mflux process frees its memory when it ends.
      await new Promise((r) => setTimeout(r, 20))
      assertEquals(comfy.posted, [
        { path: '/history', body: { delete: ['p1'] } },
        { path: '/free', body: { unload_models: true, free_memory: true } },
      ])
    } finally {
      await comfy.close()
    }
  }))

Deno.test("A ComfyUI render without the model's files says which are missing", () =>
  withTempDir(async (dir) => {
    const comfy = fakeComfyUI({ files: { ...MAC_FILES, text_encoders: [] } })
    try {
      await assertRejects(
        () =>
          comfyuiImageGenerator().generate(
            { prompt: 'x', seed: 1, settings: settings(comfy.url), dir, name: 'f' },
            new AbortController().signal,
          ),
        Error,
        "ComfyUI doesn't have Qwen-Image 2.1's files: text_encoders/",
      )
      assertEquals(comfy.queued.length, 0)
    } finally {
      await comfy.close()
    }
  }))

Deno.test("ComfyUI's errors and an unreachable server fail readably", () =>
  withTempDir(async (dir) => {
    const comfy = fakeComfyUI({ finish: 'out of memory' })
    try {
      await assertRejects(
        () =>
          comfyuiImageGenerator().generate(
            { prompt: 'x', seed: 1, settings: settings(comfy.url), dir, name: 'f' },
            new AbortController().signal,
          ),
        Error,
        'ComfyUI: KSampler out of memory',
      )
    } finally {
      await comfy.close()
    }
    await assertRejects(
      () =>
        comfyuiImageGenerator().generate(
          { prompt: 'x', seed: 1, settings: settings('http://localhost:9'), dir, name: 'f' },
          new AbortController().signal,
        ),
      Error,
      "Couldn't reach ComfyUI at http://localhost:9",
    )
  }))

Deno.test("Cancel interrupts only this render, and takes it out of ComfyUI's queue", () =>
  withTempDir(async (dir) => {
    const comfy = fakeComfyUI({ finish: 'hang' })
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new Error('Cancelled by player')), 100)
      await assertRejects(
        () =>
          comfyuiImageGenerator().generate(
            { prompt: 'x', seed: 1, settings: settings(comfy.url), dir, name: 'f' },
            controller.signal,
          ),
        Error,
        'Cancelled by player',
      )
      await new Promise((r) => setTimeout(r, 50))
      assertEquals(comfy.posted.slice(0, 2), [
        { path: '/interrupt', body: { prompt_id: 'p1' } },
        { path: '/queue', body: { delete: ['p1'] } },
      ])
    } finally {
      await comfy.close()
    }
  }))

/** SeedVR2's files as Comfy-Org packs them for an NVIDIA card, beside the "sharp" 7B. */
const SEEDVR2_FILES: Record<string, string[]> = {
  diffusion_models: [
    'seedvr2_7b_sharp_fp8_e4m3fn.safetensors',
    'seedvr2_7b_fp8_e4m3fn.safetensors',
    'seedvr2_3b_fp8_e4m3fn.safetensors',
  ],
  vae: ['seedvr2_ema_vae_fp16.safetensors'],
}

Deno.test('A ComfyUI upscale sends the picture to temp, runs SeedVR2, and blanks the upload after', () =>
  withTempDir(async (dir) => {
    const comfy = fakeComfyUI({ files: SEEDVR2_FILES })
    try {
      await Deno.writeFile(join(dir, 'frame-0-abc.png'), new Uint8Array(500))
      const generator = comfyuiImageGenerator({ upscaleUrl: () => Promise.resolve(comfy.url) })
      const file = await generator.upscale(
        { model: 'seedvr2-7b', image: 'frame-0-abc.png', seed: 3, dir, name: 'frame-0-abc-2048' },
        new AbortController().signal,
      )
      assertEquals(file, 'frame-0-abc-2048.png')
      assertEquals(await Deno.readFile(join(dir, file)), new Uint8Array([137, 80, 78, 71]))
      const [workflow] = comfy.queued as Record<string, { inputs: Record<string, unknown> }>[]
      const [picture, blank] = comfy.uploads
      assertEquals([picture.type, picture.overwrite, picture.bytes], ['temp', 'true', 500])
      assertEquals(workflow.load.inputs.image, `${picture.name} [temp]`)
      // The plain 7B, not the "sharp" one listed first.
      assertEquals(workflow.unet.inputs.unet_name, 'seedvr2_7b_fp8_e4m3fn.safetensors')
      assertEquals(workflow.vae.inputs.vae_name, 'seedvr2_ema_vae_fp16.safetensors')
      assertEquals(workflow.resize.inputs['resize_type.shorter_size'], 2048)
      assertEquals(workflow.sampler.inputs.seed, 3)
      // Afterwards a 1×1 picture replaces the upload, under the same name.
      assertEquals([blank.name, blank.type, blank.overwrite, blank.bytes < 100], [
        picture.name,
        'temp',
        'true',
        true,
      ])
      await new Promise((r) => setTimeout(r, 20))
      assertEquals(comfy.posted.map((p) => p.path), ['/history', '/free'])
    } finally {
      await comfy.close()
    }
  }))

Deno.test("A ComfyUI upscale without SeedVR2's files says which are missing, sending nothing", () =>
  withTempDir(async (dir) => {
    const comfy = fakeComfyUI({ files: { ...SEEDVR2_FILES, vae: [] } })
    try {
      await Deno.writeFile(join(dir, 'f.png'), new Uint8Array(10))
      await assertRejects(
        () =>
          comfyuiImageGenerator({ upscaleUrl: () => Promise.resolve(comfy.url) }).upscale(
            { model: 'seedvr2-3b', image: 'f.png', seed: 1, dir, name: 'f-2048' },
            new AbortController().signal,
          ),
        Error,
        "ComfyUI doesn't have SeedVR2 3B's files: vae/",
      )
      assertEquals([comfy.uploads.length, comfy.queued.length], [0, 0])
    } finally {
      await comfy.close()
    }
  }))

Deno.test('Every ComfyUI workflow loads, and fills with nothing left over', async () => {
  const fills = [
    ...COMFYUI_MODELS.map((model) => ({
      id: model.id,
      values: {
        ...pickFiles(model, (folder) => MAC_FILES[folder] ?? []),
        prompt: 'p',
        seed: 1,
        steps: 2,
        width: 512,
        height: 512,
      },
    })),
    ...COMFYUI_UPSCALERS.map((upscaler) => ({
      id: 'seedvr2',
      values: {
        ...pickFiles(upscaler, (folder) => SEEDVR2_FILES[folder] ?? []),
        image: 'x.png [temp]',
        edge: 2048,
        seed: 1,
      },
    })),
  ]
  for (const { id, values } of fills) {
    const filled = fillWorkflow(await loadWorkflow(id), values)
    assertEquals(JSON.stringify(filled).includes('"$'), false)
  }
})

Deno.test('Files are picked by the first pattern installed, so each machine can have its own build', () => {
  const [qwen] = COMFYUI_MODELS
  const windows = {
    diffusion_models: ['qwen_image_2.1_fp8_e4m3fn.safetensors'],
    text_encoders: ['qwen3vl_8b_fp8_scaled.safetensors'],
    vae: ['qwen_image_2.1_vae_bf16.safetensors'],
  }
  assertEquals(
    pickFiles(qwen, (f) => windows[f as keyof typeof windows] ?? []).unet,
    'qwen_image_2.1_fp8_e4m3fn.safetensors',
  )
  const both = {
    ...windows,
    diffusion_models: [...MAC_FILES.diffusion_models, ...windows.diffusion_models],
  }
  assertEquals(
    pickFiles(qwen, (f) => both[f as keyof typeof both] ?? []).unet,
    'qwen_image_2.1_int8_convrot.safetensors',
  )
})

Deno.test("Settings' check: ComfyUI's version and device, and whether the model's files are there", async () => {
  const ready = fakeComfyUI()
  const missing = fakeComfyUI({ files: { ...MAC_FILES, vae: [] } })
  const qwen = { imageModel: 'qwen-image-2.1' }
  try {
    assertEquals(await comfyuiStatus(ready.url, qwen), {
      up: true,
      version: '0.39.1',
      device: 'mps',
      ready: true,
    })
    const status = await comfyuiStatus(missing.url, qwen)
    assertEquals([status.up, status.up && status.ready], [true, false])
    assertEquals(status.up && status.missing?.includes('vae/'), true)
    // Upscaling there too: the Mac's files have Qwen-Image's but not SeedVR2's.
    const both = await comfyuiStatus(ready.url, { ...qwen, upscaler: 'seedvr2-7b' })
    assertEquals(both.up && [both.ready, both.missing], [
      false,
      "ComfyUI doesn't have SeedVR2 7B's files: diffusion_models/ " +
      '(^seedvr2_7b_int8 or ^seedvr2_7b_fp8 or ^seedvr2_7b_(?!sharp).*\\.safetensors$); ' +
      'vae/ (^seedvr2_ema_vae.*\\.safetensors$ or ^ema_vae)',
    ])
  } finally {
    await ready.close()
    await missing.close()
  }
  const down = await comfyuiStatus('http://localhost:9', qwen)
  assertEquals(down.up, false)
})
