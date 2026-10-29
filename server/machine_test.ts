import { assertEquals } from '@std/assert'
import { type Backend, HERE } from './backends.ts'
import type { EditModel } from './images/editModels.ts'
import type { JobKind } from './jobs.ts'
import {
  backendOf,
  editJob,
  isThisMachine,
  jobBackend,
  machineKey,
  machineOf,
  sameMachine,
  textBackendFor,
} from './machine.ts'
import { DEFAULT_SETTINGS, type SessionSettings } from './settings.ts'

const own = new Set(['studio.local', '192.0.2.10'])

Deno.test('isThisMachine knows loopback and the machine own names and addresses', () => {
  for (const address of [undefined, '', 'http://localhost:11434', 'http://127.0.0.1:8188']) {
    assertEquals(isThisMachine(address, own), true, String(address))
  }
  assertEquals(isThisMachine('http://[::1]:8188', own), true)
  assertEquals(isThisMachine('http://192.0.2.10:8188', own), true)
  assertEquals(isThisMachine('http://studio.local:8188', own), true)
  assertEquals(isThisMachine('http://192.0.2.85:8188', own), false)
})

Deno.test('sameMachine: both here, or the same host elsewhere', () => {
  assertEquals(sameMachine('http://localhost:11434', undefined, own), true)
  assertEquals(sameMachine('http://localhost:11434', 'http://192.0.2.10:8188', own), true)
  assertEquals(sameMachine('http://localhost:11434', 'http://192.0.2.85:8188', own), false)
  assertEquals(sameMachine('http://192.0.2.85:11434', undefined, own), false)
  assertEquals(sameMachine('http://192.0.2.85:11434', 'http://192.0.2.85:8188', own), true)
})

const yes = { available: true }
const no = { available: false, reason: 'not here' }
/** A Mac: mflux and the voice service. */
const mac = { images: yes, upscale: yes, edits: yes, voices: yes }
/** A PC: neither. */
const pc = { images: no, upscale: no, edits: no, voices: no }
const PC_COMFYUI: Backend = { id: 'pc', kind: 'comfyui', address: 'http://192.0.2.85:8188' }
const MAC_COMFYUI: Backend = { id: 'comfy', kind: 'comfyui', address: '' }
const backends = [HERE, PC_COMFYUI, MAC_COMFYUI]

Deno.test('backendOf: the preferred Backend if it can, else the next listed that can', () => {
  const now = {
    backends,
    runOn: { ...DEFAULT_SETTINGS.runOn, images: 'here', upscale: 'pc', voices: 'here' },
  }
  const render = (model: string, here = mac) => backendOf({ kind: 'render', model }, now, here)?.id
  // A Mac renders here what mflux has (Qwen-Image 2.1 on both).
  assertEquals(render('qwen-image-2.1'), 'here')
  // A PC can't run mflux: Qwen-Image on its ComfyUI, mflux's own models nowhere.
  assertEquals([render('qwen-image-2.1', pc), render('krea-2', pc)], ['pc', undefined])
  // Upscale on the PC, as preferred, though here could.
  assertEquals(backendOf({ kind: 'upscale' }, now, mac)?.id, 'pc')
  // Voices here, or on the first ComfyUI where there's no voice service.
  assertEquals(backendOf({ kind: 'voice' }, now, mac)?.id, 'here')
  assertEquals(backendOf({ kind: 'voice' }, now, pc)?.id, 'pc')
  // An edit by its edit model's kind of Backend.
  assertEquals(backendOf(editJob('qwen-image-2.1-edit'), now, mac)?.id, 'here')
  assertEquals(backendOf(editJob('flux3-klein-edit'), now, mac)?.id, 'pc')
  // Anything else, here.
  assertEquals(backendOf(undefined, now, pc), HERE)
})

Deno.test('A kind a Session or an edit would rather run on is followed where it can be, else any', () => {
  // Settings send renders and edits to the PC's ComfyUI.
  const now = { backends, runOn: { ...DEFAULT_SETTINGS.runOn, images: 'pc', edits: 'pc' } }
  const render = (on?: 'mflux' | 'comfyui', here = mac) =>
    backendOf({ kind: 'render', model: 'qwen-image-2.1', ...(on && { on }) }, now, here)?.id
  assertEquals([render(), render('mflux'), render('comfyui')], ['pc', 'here', 'pc'])
  // A Session that picked mflux, opened on a PC: it still renders, on a ComfyUI.
  assertEquals(render('mflux', pc), 'pc')
  assertEquals(backendOf(editJob('qwen-image-2.1-edit', 'mflux'), now, mac)?.id, 'here')
  // FLUX.3 Klein Edit has no mflux: it goes where it can.
  assertEquals(backendOf(editJob('flux3-klein-edit', 'mflux'), now, mac)?.id, 'pc')
})

Deno.test('textBackendFor: the preferred text Backend if it lists the model, else the next', async () => {
  const lm: Backend = { id: 'lm', kind: 'openai', address: 'http://192.0.2.85:1234/v1' }
  const ollama: Backend = { id: 'ollama', kind: 'ollama', address: '' }
  const now = { backends: [HERE, ollama, lm], runOn: { ...DEFAULT_SETTINGS.runOn, text: 'lm' } }
  const listed = (b: Backend) =>
    b.id === 'lm' ? Promise.resolve(['gemma-4-26b']) : Promise.reject(new Error('down'))
  assertEquals((await textBackendFor(now, 'gemma-4-26b', listed))?.id, 'lm')
  // On none that answers: the preferred one, to say why.
  assertEquals((await textBackendFor(now, 'llama3', listed))?.id, 'lm')
  const both = (b: Backend) => Promise.resolve(b.id === 'ollama' ? ['llama3'] : ['gemma-4-26b'])
  assertEquals((await textBackendFor(now, 'llama3', both))?.id, 'ollama')
})

Deno.test('machineKey: here for this machine, the host for another', () => {
  assertEquals(machineKey(undefined, own), 'here')
  assertEquals(machineKey('http://127.0.0.1:8188', own), 'here')
  assertEquals(machineKey('http://192.0.2.10:8188', own), 'here')
  assertEquals(machineKey('http://192.0.2.85:8188', own), '192.0.2.85')
  assertEquals(machineKey('http://192.0.2.85:11434', own), '192.0.2.85')
})

Deno.test('jobBackend: a picture with the Text Model, a render by its Image Model, a line as voices go', () => {
  // A Session that would rather render on a ComfyUI, as one picked on a kind of backend does.
  const session: Pick<SessionSettings, 'imageModel' | 'imageBackend'> = {
    ...DEFAULT_SETTINGS,
    imageModel: 'qwen-image-2.1',
    imageBackend: 'comfyui',
  }
  const now = { ...DEFAULT_SETTINGS, backends, runOn: { ...DEFAULT_SETTINGS.runOn, voices: 'pc' } }
  const text: Backend = { id: 'ollama', kind: 'ollama', address: 'http://192.0.2.85:11434' }
  const on = (kind: JobKind, s = session, editModel?: EditModel) =>
    machineOf(jobBackend(kind, s, now, mac, { editModel, text }), own)
  assertEquals(on('render'), '192.0.2.85')
  assertEquals(on('render', DEFAULT_SETTINGS), 'here')
  assertEquals(on('picture'), '192.0.2.85')
  assertEquals([on('speak'), on('speak-thought'), on('voice')], Array(3).fill('192.0.2.85'))
  assertEquals([on('upscale'), on('scene')], ['here', 'here'])
  // An edit by its edit model, the one told or Settings'.
  assertEquals(on('edit', session, 'flux3-klein-edit'), '192.0.2.85')
  assertEquals(on('edit'), 'here')
})

Deno.test('A clip goes to the ComfyUI pictures go to, else the first listed, never here', () => {
  const clip = (images: string, listed = backends) =>
    backendOf(
      { kind: 'video' },
      { backends: listed, runOn: { ...DEFAULT_SETTINGS.runOn, images } },
      mac,
    )
      ?.id
  assertEquals(clip('comfy'), 'comfy')
  assertEquals(clip('here'), 'pc')
  assertEquals(clip('here', [HERE]), undefined)
})

Deno.test('Clips go to the ComfyUI Settings name for them, over the one pictures go to', () => {
  const runOn = { ...DEFAULT_SETTINGS.runOn, images: 'comfy' }
  assertEquals(backendOf({ kind: 'video' }, { backends, runOn, videoOn: 'pc' }, mac)?.id, 'pc')
  assertEquals(backendOf({ kind: 'video' }, { backends, runOn }, mac)?.id, 'comfy')
})
