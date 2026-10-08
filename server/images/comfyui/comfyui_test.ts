import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { DEFAULT_SETTINGS, type Settings } from '../../settings.ts'
import { withTempDir } from '../../testing.ts'
import { fillWorkflow } from '../../comfyui/client.ts'
import { fakeComfyUI as fakeServer } from '../../comfyui/testing.ts'
import { comfyuiImageGenerator } from './comfyui.ts'
import { COMFYUI_MODELS, COMFYUI_UPSCALERS } from './models.ts'
import { loadModelWorkflow, pickFiles } from './workflow.ts'

const MAC_FILES: Record<string, string[]> = {
  diffusion_models: [
    'krea2_turbo_fp8_scaled.safetensors',
    'qwen_image_2.1_int8_convrot.safetensors',
  ],
  text_encoders: ['qwen3vl_4b_fp8_scaled.safetensors', 'qwen3vl_8b_int8_convrot.safetensors'],
  vae: ['qwen_image_vae.safetensors', 'qwen_image_2.1_vae_bf16.safetensors'],
}

/** A stand-in ComfyUI with the Mac's model files, unless told others. */
const fakeComfyUI = (opts: Parameters<typeof fakeServer>[0] = {}) =>
  fakeServer({ files: MAC_FILES, ...opts })

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
      // ComfyUI keeps nothing: the prompt leaves its history once ComfyUI has written it there
      // (deleted any sooner, it stays), and its models are unloaded, as an mflux process frees its
      // memory when it ends.
      await new Promise((r) => setTimeout(r, 80))
      assertEquals(comfy.posted, [
        { path: '(in history)', body: null },
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
      await new Promise((r) => setTimeout(r, 150))
      assertEquals(comfy.posted.slice(0, 2), [
        { path: '/interrupt', body: { prompt_id: 'p1' } },
        { path: '/queue', body: { delete: ['p1'] } },
      ])
      // The prompt leaves the history only once ComfyUI has stopped it, or it would stay there.
      assertEquals(comfy.posted.slice(2).map((p) => p.path), ['(in history)', '/history', '/free'])
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
      // Out of the history once ComfyUI has written it there, then its models unloaded.
      await new Promise((r) => setTimeout(r, 80))
      assertEquals(comfy.posted.map((p) => p.path), ['(in history)', '/history', '/free'])
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

Deno.test('A ComfyUI that stops answering mid-render fails the render instead of hanging it', () =>
  withTempDir(async (dir) => {
    const comfy = fakeComfyUI({ finish: 'hang', dies: true })
    try {
      const started = performance.now()
      await assertRejects(
        () =>
          comfyuiImageGenerator({ checkEveryMs: 100 }).generate(
            { prompt: 'x', seed: 1, settings: settings(comfy.url), dir, name: 'f' },
            new AbortController().signal,
          ),
        Error,
        'ComfyUI stopped answering',
      )
      // Two missed checks, about 0.2 s, not the whole wait.
      assertEquals(performance.now() - started < 2000, true)
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
    const filled = fillWorkflow(await loadModelWorkflow(id), values)
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
