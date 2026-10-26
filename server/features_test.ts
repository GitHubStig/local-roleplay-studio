import { assertEquals } from '@std/assert'
import { detectFeatures, type Machine, withBackends } from './features.ts'

const machine = (os: Machine['os'], arch: Machine['arch'], commands: string[]): Machine => ({
  os,
  arch,
  has: (command) => Promise.resolve(commands.includes(command)),
})
const available = (a: Awaited<ReturnType<typeof detectFeatures>>) =>
  Object.entries(a).filter(([, v]) => v.available).map(([k]) => k)

Deno.test('detectFeatures: an Apple Silicon Mac with mflux and uv runs everything', async () => {
  const mac = machine('darwin', 'aarch64', ['mflux-generate-flux2', 'uv'])
  assertEquals(available(await detectFeatures(mac)), [
    'images',
    'upscale',
    'edits',
    'voices',
    'scenes',
    'figures',
    'lito',
    'style',
  ])
})

Deno.test('detectFeatures: Windows with an NVIDIA card runs SHARP and TripoSplat, not the MLX ones', async () => {
  const features = await detectFeatures(machine('windows', 'x86_64', ['uv', 'nvidia-smi']))
  assertEquals(available(features), ['scenes', 'figures', 'style'])
  assertEquals(features.images.reason, 'mflux runs only on Apple Silicon Macs')
  assertEquals(features.upscale.reason, 'mflux runs only on Apple Silicon Macs')
  assertEquals(features.edits.reason, 'mflux runs only on Apple Silicon Macs')
  assertEquals(
    features.voices.reason,
    'The voice service (mlx-audio) runs only on Apple Silicon Macs',
  )
  assertEquals(features.lito.reason, 'LiTo (through mlx-spatial) runs only on Apple Silicon Macs')
})

Deno.test('detectFeatures: Windows with only Ollama runs none of them, and says why', async () => {
  const features = await detectFeatures(machine('windows', 'x86_64', []))
  assertEquals(available(features), [])
  assertEquals(features.scenes.reason?.startsWith("uv isn't installed"), true)
  const noGpu = await detectFeatures(machine('linux', 'x86_64', ['uv']))
  assertEquals(noGpu.figures.reason, 'TripoSplat needs an Apple Silicon Mac or an NVIDIA GPU')
  assertEquals(noGpu.style.available, true)
})

Deno.test('detectFeatures: a Mac without mflux has no pictures, unless placeholders stand in', async () => {
  const mac = machine('darwin', 'aarch64', ['uv'])
  assertEquals((await detectFeatures(mac)).images.available, false)
  assertEquals((await detectFeatures(mac, { placeholderImages: true })).images.available, true)
})

Deno.test('withBackends: choosing ComfyUI enables edits on a machine without mflux', async () => {
  const detected = await detectFeatures(machine('windows', 'x86_64', ['uv', 'nvidia-smi']))
  const usingComfyUI = withBackends(detected, {
    imageBackend: 'comfyui',
    upscaleBackend: 'mflux',
    voiceBackend: 'mlx-audio',
  })
  assertEquals(usingComfyUI.images.available, true)
  assertEquals(usingComfyUI.edits.available, true)

  const usingMflux = withBackends(detected, {
    imageBackend: 'mflux',
    upscaleBackend: 'mflux',
    voiceBackend: 'mlx-audio',
  })
  assertEquals(usingMflux.edits.available, false)
  assertEquals(
    usingMflux.edits.reason,
    'mflux runs only on Apple Silicon Macs; or choose ComfyUI as the Image backend in Settings',
  )
})
