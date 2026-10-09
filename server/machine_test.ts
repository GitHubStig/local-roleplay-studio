import { assertEquals } from '@std/assert'
import { isThisMachine, jobServer, sameMachine, textServer } from './machine.ts'
import { DEFAULT_SETTINGS } from './settings.ts'

const own = new Set(['studio.local', '192.168.50.10'])

Deno.test('isThisMachine knows loopback and the machine own names and addresses', () => {
  for (const address of [undefined, '', 'http://localhost:11434', 'http://127.0.0.1:8188']) {
    assertEquals(isThisMachine(address, own), true, String(address))
  }
  assertEquals(isThisMachine('http://[::1]:8188', own), true)
  assertEquals(isThisMachine('http://192.168.50.10:8188', own), true)
  assertEquals(isThisMachine('http://studio.local:8188', own), true)
  assertEquals(isThisMachine('http://192.168.50.85:8188', own), false)
})

Deno.test('sameMachine: both here, or the same host elsewhere', () => {
  assertEquals(sameMachine('http://localhost:11434', undefined, own), true)
  assertEquals(sameMachine('http://localhost:11434', 'http://192.168.50.10:8188', own), true)
  assertEquals(sameMachine('http://localhost:11434', 'http://192.168.50.85:8188', own), false)
  assertEquals(sameMachine('http://192.168.50.85:11434', undefined, own), false)
  assertEquals(sameMachine('http://192.168.50.85:11434', 'http://192.168.50.85:8188', own), true)
})

Deno.test('jobServer: a render on its Session backend, upscale and voices on Settings now', () => {
  const pc = 'http://192.168.50.85:8188'
  const now = { ...DEFAULT_SETTINGS, imageBaseUrl: pc }
  const render = (imageBackend: 'mflux' | 'comfyui') =>
    jobServer({ kind: 'render', settings: { imageBackend, imageBaseUrl: pc } }, now)
  assertEquals([render('mflux'), render('comfyui')], [undefined, pc])
  assertEquals(jobServer({ kind: 'upscale' }, { ...now, upscaleBackend: 'comfyui' }), pc)
  assertEquals(jobServer({ kind: 'upscale' }, { ...now, upscaleBackend: 'mflux' }), undefined)
  assertEquals(jobServer({ kind: 'voice' }, { ...now, voiceBackend: 'comfyui' }), pc)
  assertEquals(jobServer({ kind: 'voice' }, { ...now, voiceBackend: 'mlx-audio' }), undefined)
  assertEquals(jobServer(undefined, now), undefined)
  // ComfyUI's default address when Settings leave it empty.
  assertEquals(
    jobServer({ kind: 'upscale' }, { ...now, upscaleBackend: 'comfyui', imageBaseUrl: '' }),
    'http://127.0.0.1:8188',
  )
})

Deno.test('textServer: the address in Settings, or Ollama default', () => {
  assertEquals(textServer({ textBackend: 'ollama', textBaseUrl: '' })!.startsWith('http'), true)
  assertEquals(
    textServer({ textBackend: 'openai', textBaseUrl: 'http://pc:1234/v1' }),
    'http://pc:1234/v1',
  )
})
