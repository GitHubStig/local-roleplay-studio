import { assertEquals, assertRejects } from '@std/assert'
import type { Backend } from '../backends.ts'
import type { EditRequest, ImageGenerator } from './imageGenerator.ts'
import { imageBackends } from './backend.ts'
import { backendOf } from '../machine.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'

const editBackend = (name: string): ImageGenerator => ({
  generate: () => Promise.resolve(name),
  upscale: () => Promise.resolve(name),
  edit: () => Promise.resolve(`${name}.png`),
})

const edit = (model: EditRequest['model']): EditRequest => ({
  model,
  image: 'frame.png',
  instruction: 'An open hand.',
  seed: 1,
  dir: '.',
  name: 'edit',
})

const yes = { available: true }
const no = { available: false, reason: 'mflux runs only on Apple Silicon Macs' }
const PC: Backend = { id: 'pc', kind: 'comfyui', address: 'http://192.168.50.85:8188' }
const settings = {
  ...DEFAULT_SETTINGS,
  backends: [...DEFAULT_SETTINGS.backends, PC],
  runOn: { ...DEFAULT_SETTINGS.runOn, upscale: 'pc' },
}

Deno.test("Each job runs on its Backend: an edit on its edit model's, at that ComfyUI's address", async () => {
  const both = imageBackends({
    mflux: editBackend('mflux'),
    comfyui: (address) => editBackend(`comfyui at ${address}`),
    backendOf: (job) =>
      Promise.resolve(
        backendOf(job, settings, { images: yes, upscale: yes, edits: yes, voices: yes }),
      ),
  })
  const signal = new AbortController().signal
  assertEquals(await both.edit(edit('qwen-image-2.1-edit'), signal), 'mflux.png')
  assertEquals(
    await both.edit(edit('flux3-klein-edit-comfyui'), signal),
    'comfyui at http://192.168.50.85:8188.png',
  )
  // Upscale where Settings prefer, though mflux is here.
  const upscale = { model: 'seedvr2-7b', image: 'frame.png', seed: 1, dir: '.', name: 'up' }
  assertEquals(await both.upscale(upscale, signal), 'comfyui at http://192.168.50.85:8188')

  // A PC without a ComfyUI listed can't edit with mflux's.
  const pc = imageBackends({
    comfyui: (address) => editBackend(address),
    backendOf: (job) =>
      Promise.resolve(
        backendOf(job, DEFAULT_SETTINGS, { images: no, upscale: no, edits: no, voices: no }),
      ),
  })
  await assertRejects(
    () => pc.edit(edit('qwen-image-2.1-edit'), signal),
    Error,
    'No Backend can edit with qwen-image-2.1-edit',
  )
})
