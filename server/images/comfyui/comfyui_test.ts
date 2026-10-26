import { assertEquals, assertRejects, assertThrows } from '@std/assert'
import { join } from '@std/path'
import { DEFAULT_SETTINGS, type Settings } from '../../settings.ts'
import { paintedMask, withTempDir } from '../../testing.ts'
import type { EditRequest } from '../imageGenerator.ts'
import { fillWorkflow } from '../../comfyui/client.ts'
import { fakeComfyUI as fakeServer } from '../../comfyui/testing.ts'
import { comfyuiImageGenerator } from './comfyui.ts'
import { COMFYUI_EDITORS, COMFYUI_MODELS, COMFYUI_UPSCALERS, findComfyModel } from './models.ts'
import { loadModelWorkflow, pickFiles } from './workflow.ts'

const MAC_FILES: Record<string, string[]> = {
  diffusion_models: [
    'krea2_turbo_fp8_scaled.safetensors',
    'qwen_image_2.1_int8_convrot.safetensors',
  ],
  text_encoders: ['qwen3vl_4b_fp8_scaled.safetensors', 'qwen3vl_8b_int8_convrot.safetensors'],
  vae: ['qwen_image_vae.safetensors', 'qwen_image_2.1_vae_bf16.safetensors'],
}

/**
 * The Windows PC's: Qwen-Image 2.1 and its Turbo, FLUX.2 Klein 4B, FLUX.3 Klein, Ming-Image,
 * MOSS-Image and Z-Image Turbo.
 */
const PC_FILES: Record<string, string[]> = {
  diffusion_models: [
    'flux-2-klein-4b.safetensors',
    'flux3_image_klein_sd_int8_convrot.safetensors',
    'ming_image_0.1_design_int8_convrot.safetensors',
    'moss_image_sft_int8_convrot.safetensors',
    'qwen_image_2.1_int8_convrot.safetensors',
    'qwen_image_2.1_turbo_int8_convrot.safetensors',
    'z_image_turbo_int8_convrot.safetensors',
  ],
  text_encoders: [
    'ming_image_0.1_ling_mini_2.0_w4a8.safetensors',
    'qwen3.5_9b_w4a8_gptq.safetensors',
    'qwen3vl_4b_int8_convrot.safetensors',
    'qwen3vl_8b_int8_convrot.safetensors',
    'qwen_3_4b.safetensors',
  ],
  vae: [
    'ae.safetensors',
    'flux2-vae.safetensors',
    'flux2-vae_small.safetensors',
    'ming_image_vae_bf16.safetensors',
    'qwen_image_2.1_vae_bf16.safetensors',
  ],
}

/** A stand-in ComfyUI with the Mac's model files, unless told others. */
const fakeComfyUI = (opts: Parameters<typeof fakeServer>[0] = {}) =>
  fakeServer({ files: MAC_FILES, ...opts })

const settings = (extra: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  imageBackend: 'comfyui',
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
      const file = await comfyuiImageGenerator({ address: comfy.url }).generate(
        {
          prompt: 'Kael at the bar.',
          seed: 7,
          settings: settings(),
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
        [workflow.sampler.inputs.seed, workflow.sampler.inputs.steps, workflow.sampler.inputs.cfg],
        [7, 25, 1],
      )
      assertEquals([workflow.latent.inputs.width, workflow.latent.inputs.height], [1024, 1024])
      // ComfyUI keeps nothing: the prompt leaves its history once ComfyUI has written it there
      // (deleted any sooner, it stays), and its models are unloaded, as an mflux process frees its
      // memory when it ends.
      await comfy.whenPosted('/free')
      assertEquals(comfy.posted, [
        { path: '(in history)', body: null },
        { path: '/history', body: { delete: ['p1'] } },
        { path: '/free', body: { unload_models: true, free_memory: true } },
      ])
    } finally {
      await comfy.close()
    }
  }))

type Nodes = Record<string, { class_type: string; inputs: Record<string, unknown> }>

/** An edit of a 100×50 picture (a stand-in: ComfyUI's fake doesn't read it) on the PC's files. */
async function comfyEdit(
  dir: string,
  model: EditRequest['model'],
  mask?: Uint8Array<ArrayBuffer>,
) {
  const comfy = fakeComfyUI({ files: PC_FILES })
  try {
    await Deno.writeFile(join(dir, 'frame.png'), new Uint8Array(500))
    if (mask) await Deno.writeFile(join(dir, 'mask.png'), mask)
    const file = await comfyuiImageGenerator({ address: comfy.url }).edit(
      {
        model,
        image: 'frame.png',
        ...(mask && { mask: 'mask.png' }),
        instruction: 'An open hand.',
        seed: 7,
        dir,
        name: 'edit-0-test',
      },
      new AbortController().signal,
    )
    assertEquals(await Deno.readFile(join(dir, file)), new Uint8Array([137, 80, 78, 71]))
    await comfy.whenPosted('/free')
    return { file, workflow: comfy.queued[0] as Nodes, uploads: comfy.uploads }
  } finally {
    await comfy.close()
  }
}

Deno.test('A ComfyUI edit repaints only the painted area, on the Image Model’s own files, and blanks its uploads', () =>
  withTempDir(async (dir) => {
    const { file, workflow: w, uploads } = await comfyEdit(
      dir,
      'qwen-image-2.1-edit-comfyui',
      await paintedMask(100, 50, [10, 10, 30, 30]),
    )
    assertEquals(file, 'edit-0-test.png')
    assertEquals(
      [w.unet.inputs.unet_name, w.clip.inputs.clip_name, w.vae.inputs.vae_name],
      [
        'qwen_image_2.1_int8_convrot.safetensors',
        'qwen3vl_8b_int8_convrot.safetensors',
        'qwen_image_2.1_vae_bf16.safetensors',
      ],
    )
    // The picture is the reference; the instruction goes as typed; steps are the model's.
    assertEquals(w.image.inputs.image, `${uploads[0].name} [temp]`)
    assertEquals(w.conditioning.inputs['images.image_1'], ['image', 0])
    assertEquals(w.conditioning.inputs.prompt, 'An open hand.')
    assertEquals([w.sampler.inputs.seed, w.sampler.inputs.steps], [7, 25])
    // The painted area is the latent's noise mask, and the picture is pasted back around it.
    assertEquals(w.mask.inputs.image, `${uploads[1].name} [temp]`)
    assertEquals(w.sampler.inputs.latent_image, ['masked', 0])
    assertEquals(w.masked.inputs, { samples: ['encode', 0], mask: ['mask', 0] })
    assertEquals(w.save.inputs.images, ['composite', 0])
    // Both uploads are written over with a blank once it's done.
    assertEquals(uploads.map((u) => [u.name, u.bytes < 100]), [
      [uploads[0].name, false],
      [uploads[1].name, false],
      [uploads[0].name, true],
      [uploads[1].name, true],
    ])
  }))

Deno.test('A ComfyUI FLUX.3 edit is told where to paint, as a box for each painted area', () =>
  withTempDir(async (dir) => {
    const { workflow: w } = await comfyEdit(
      dir,
      'flux3-klein-edit-comfyui',
      await paintedMask(100, 50, [0, 0, 16, 16], [64, 32, 96, 48]),
    )
    assertEquals(w.unet.inputs.unet_name, 'flux3_image_klein_sd_int8_convrot.safetensors')
    assertEquals(w.conditioning.inputs['images.image0'], ['image', 0])
    assertEquals(w.negative.class_type, 'ConditioningZeroOut')
    assertEquals(w.sampler.inputs.steps, 16)
    assertEquals(
      w.text.inputs.text,
      'In <ref_image_0>, repaint <obj_1> and <obj_2>: An open hand. Keep everything else ' +
        'unchanged. [{"id":"obj_1","bbox":[0,0,320,160],"desc":"An open hand."},' +
        '{"id":"obj_2","bbox":[640,640,960,960],"desc":"An open hand."}]',
    )
  }))

Deno.test('A ComfyUI edit with nothing painted repaints the whole picture', () =>
  withTempDir(async (dir) => {
    const { workflow: w, uploads } = await comfyEdit(dir, 'flux3-klein-edit-comfyui')
    for (const node of ['mask', 'encode', 'masked', 'composite']) assertEquals(w[node], undefined)
    assertEquals(w.sampler.inputs.latent_image, ['conditioning', 2])
    assertEquals(w.save.inputs.images, ['rgb', 0])
    assertEquals(w.text.inputs.text, 'In <ref_image_0>, An open hand.')
    assertEquals(uploads.map((u) => u.bytes < 100), [false, true])
  }))

Deno.test("A ComfyUI render without the model's files says which are missing", () =>
  withTempDir(async (dir) => {
    const comfy = fakeComfyUI({ files: { ...MAC_FILES, text_encoders: [] } })
    try {
      await assertRejects(
        () =>
          comfyuiImageGenerator({ address: comfy.url }).generate(
            { prompt: 'x', seed: 1, settings: settings(), dir, name: 'f' },
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
          comfyuiImageGenerator({ address: comfy.url }).generate(
            { prompt: 'x', seed: 1, settings: settings(), dir, name: 'f' },
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
        comfyuiImageGenerator({ address: 'http://localhost:9' }).generate(
          { prompt: 'x', seed: 1, settings: settings(), dir, name: 'f' },
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
      await assertRejects(
        () =>
          comfyuiImageGenerator({ address: comfy.url }).generate(
            { prompt: 'x', seed: 1, settings: settings(), dir, name: 'f' },
            controller.signal,
            // Cancelled once it's rendering.
            () => controller.abort(new Error('Cancelled by player')),
          ),
        Error,
        'Cancelled by player',
      )
      // A Cancel returns at once, before the clean-up: wait for it.
      await comfy.whenPosted('/free')
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
      const generator = comfyuiImageGenerator({ address: comfy.url })
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
      await comfy.whenPosted('/free')
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
          comfyuiImageGenerator({ address: comfy.url }).upscale(
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
          comfyuiImageGenerator({ address: comfy.url, checkEveryMs: 100 }).generate(
            { prompt: 'x', seed: 1, settings: settings(), dir, name: 'f' },
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
        ...pickFiles(model, (folder) => PC_FILES[folder] ?? []),
        prompt: 'p',
        seed: 1,
        steps: 2,
        ...(model.cfg === undefined ? {} : { cfg: model.cfg }),
        width: 512,
        height: 512,
      },
    })),
    ...COMFYUI_EDITORS.map((editor) => ({
      id: editor.workflow,
      values: {
        ...pickFiles(findComfyModel(editor.model)!, (folder) => PC_FILES[folder] ?? []),
        image: 'x.png [temp]',
        mask: 'mask.png [temp]',
        prompt: 'p',
        seed: 1,
        steps: 2,
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

Deno.test("A model has a CFG exactly when its workflow takes one, so it's never dropped", async () => {
  for (const model of COMFYUI_MODELS) {
    const takesCfg = JSON.stringify(await loadModelWorkflow(model.id)).includes('"$cfg"')
    assertEquals(model.cfg !== undefined, takesCfg, model.id)
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

Deno.test("Qwen-Image 2.1 never picks its Turbo's DiT, a Klein its undistilled base, nor Ming-Image its Layer", () => {
  const withDiTs = (dits: string[]) => (f: string) =>
    f === 'diffusion_models' ? dits : PC_FILES[f] ?? []
  const model = (id: string) => COMFYUI_MODELS.find((m) => m.id === id)!
  assertThrows(() =>
    pickFiles(
      model('qwen-image-2.1'),
      withDiTs(['qwen_image_2.1_turbo_int8_convrot.safetensors']),
    )
  )
  assertThrows(() =>
    pickFiles(model('flux2-klein-4b'), withDiTs(['flux-2-klein-base-4b.safetensors']))
  )
  // BFL names Klein Base both ways in one repo: with `_base_`, and with nothing.
  assertThrows(() =>
    pickFiles(
      model('flux3-klein'),
      withDiTs([
        'flux3_image_klein_int8_convrot.safetensors',
        'flux3_image_klein_base_int8_convrot.safetensors',
      ]),
    )
  )
  assertThrows(() =>
    pickFiles(
      model('ming-image'),
      withDiTs(['ming_image_0.1_design_layer_int8_convrot.safetensors']),
    )
  )
})
