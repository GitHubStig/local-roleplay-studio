import { assertEquals, assertRejects } from '@std/assert'
import type { EditRequest, ImageGenerator } from './imageGenerator.ts'
import { imageBackends } from './backend.ts'

const editBackend = (name: string): ImageGenerator => ({
  generate: () => Promise.resolve(name),
  upscale: () => Promise.resolve(name),
  edit: () => Promise.resolve(`${name}.png`),
})

const edit = (model: EditRequest['model']): EditRequest => ({
  model,
  imageBaseUrl: '',
  image: 'frame.png',
  instruction: 'An open hand.',
  seed: 1,
  dir: '.',
  name: 'edit',
})

Deno.test('An edit runs on its edit model’s backend, and says so where that isn’t here', async () => {
  const both = imageBackends({
    mflux: editBackend('mflux'),
    comfyui: editBackend('comfyui'),
    upscaleBackend: () => Promise.resolve('mflux'),
  })
  const signal = new AbortController().signal
  assertEquals(await both.edit(edit('qwen-image-2.1-edit'), signal), 'mflux.png')
  assertEquals(await both.edit(edit('qwen-image-2.1-edit-comfyui'), signal), 'comfyui.png')
  assertEquals(await both.edit(edit('flux3-klein-edit-comfyui'), signal), 'comfyui.png')

  const comfyuiOnly = imageBackends({
    comfyui: editBackend('comfyui'),
    upscaleBackend: () => Promise.resolve('comfyui'),
  })
  await assertRejects(
    () => comfyuiOnly.edit(edit('qwen-image-2.1-edit'), signal),
    Error,
    "mflux isn't installed here",
  )
})
