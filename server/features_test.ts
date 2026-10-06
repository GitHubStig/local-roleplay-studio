import { assertEquals } from '@std/assert'
import { detectFeatures, type Machine } from './features.ts'

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
    'voices',
    'scenes',
    'figures',
    'lito',
  ])
})

Deno.test('detectFeatures: Windows with an NVIDIA card runs SHARP and TripoSplat, not the MLX ones', async () => {
  const features = await detectFeatures(machine('windows', 'x86_64', ['uv', 'nvidia-smi']))
  assertEquals(available(features), ['scenes', 'figures'])
  assertEquals(features.images.reason, 'mflux, the image backend, runs only on Apple Silicon Macs')
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
})

Deno.test('detectFeatures: a Mac without mflux has no pictures, unless placeholders stand in', async () => {
  const mac = machine('darwin', 'aarch64', ['uv'])
  assertEquals((await detectFeatures(mac)).images.available, false)
  assertEquals((await detectFeatures(mac, { placeholderImages: true })).images.available, true)
})
