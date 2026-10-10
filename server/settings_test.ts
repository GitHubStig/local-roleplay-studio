import { assertEquals } from '@std/assert'
import { join, toFileUrl } from '@std/path'
import {
  DEFAULT_SETTINGS,
  fileSettingsStore,
  machineDefaults,
  renderSettings,
  validateSettings,
} from './settings.ts'

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await Deno.makeTempDir()
  try {
    await fn(dir)
  } finally {
    await Deno.remove(dir, { recursive: true })
  }
}

Deno.test('fileSettingsStore returns defaults when the file is missing', () =>
  withTempDir(async (dir) => {
    const store = fileSettingsStore(join(dir, 'settings.json'))
    assertEquals(await store.load(), DEFAULT_SETTINGS)
  }))

Deno.test('fileSettingsStore round-trips saved settings', () =>
  withTempDir(async (dir) => {
    const store = fileSettingsStore(join(dir, 'settings.json'))
    const next = { ...DEFAULT_SETTINGS, textModel: 'gemma4:31b-mlx', seedMode: 'fixed' as const }
    await store.save(next)
    assertEquals(await store.load(), next)
  }))

Deno.test('fileSettingsStore fills fields missing from an older file', () =>
  withTempDir(async (dir) => {
    const path = join(dir, 'settings.json')
    await Deno.writeTextFile(path, JSON.stringify({ textModel: 'llama3:latest' }))
    assertEquals(await fileSettingsStore(path).load(), {
      ...DEFAULT_SETTINGS,
      textModel: 'llama3:latest',
    })
  }))

Deno.test('fileSettingsStore keeps the API key in the file but out of Settings', () =>
  withTempDir(async (dir) => {
    const path = join(dir, 'settings.json')
    const store = fileSettingsStore(path)
    await store.saveApiKey('sk-secret')
    await store.save({ ...DEFAULT_SETTINGS, textModel: 'llama3:latest' })
    assertEquals(await store.loadApiKey(), 'sk-secret') // saving Settings keeps it
    assertEquals('textApiKey' in await store.load(), false)
    assertEquals(JSON.parse(await Deno.readTextFile(path)).textApiKey, 'sk-secret')
    // Windows has no Unix modes: the file takes the folder's permissions there.
    if (Deno.build.os !== 'windows') assertEquals((await Deno.stat(path)).mode! & 0o777, 0o600)
    await store.saveApiKey('')
    assertEquals(await store.loadApiKey(), '')
    assertEquals((await store.load()).textModel, 'llama3:latest')
  }))

Deno.test('fileSettingsStore falls back to defaults on a corrupt file', () =>
  withTempDir(async (dir) => {
    const path = join(dir, 'settings.json')
    await Deno.writeTextFile(path, '{ nope')
    assertEquals(await fileSettingsStore(path).load(), DEFAULT_SETTINGS)
  }))

Deno.test('fileSettingsStore saves to a file URL whose path has spaces', () =>
  withTempDir(async (dir) => {
    const url = toFileUrl(join(dir, 'my settings ü.json'))
    const store = fileSettingsStore(url)
    await store.save({ ...DEFAULT_SETTINGS, textModel: 'llama3:latest' })
    assertEquals((await store.load()).textModel, 'llama3:latest')
  }))

Deno.test("A Session renders with its own model, steps and seed's settings, and the rest as now", () => {
  const session = { ...DEFAULT_SETTINGS, imageModel: 'flux2-klein-4b', steps: 4, size: 'square' }
  const now = {
    ...DEFAULT_SETTINGS,
    imageModel: 'krea-2',
    steps: 8,
    size: 'landscape',
    fast: true,
    stepCache: null,
    quantize: 8 as const,
    float16: false,
    imageBaseUrl: 'http://pc:8188',
    seed: 1,
  }
  assertEquals(renderSettings(session, now), {
    ...session,
    size: 'landscape',
    fast: true,
    stepCache: null,
    quantize: 8,
    float16: false,
    imageBaseUrl: 'http://pc:8188',
  })
})

Deno.test('validateSettings fills in what an older file lacks, keeps what it may be, refuses the rest', () => {
  // Each field: what it comes to when missing, a value it may take, and one it may not.
  const fields: [keyof typeof DEFAULT_SETTINGS, unknown, unknown, unknown][] = [
    ['thinking', false, true, 'yes'],
    ['upscaler', 'seedvr2-7b', 'seedvr2-3b', 'esrgan'],
    ['limits', true, false, 'no'],
    ['artModel', '', 'gemma4:31b-mlx', 3],
    ['artStyle', 'prose', 'tags', 'booru'],
    ['stepCache', 0.4, null, 0.9],
    ['fast', false, true, 'yes'],
    ['float16', true, false, 'yes'],
    ['previews', true, false, 'yes'],
  ]
  for (const [field, missing, valid, invalid] of fields) {
    const { [field]: _, ...older } = DEFAULT_SETTINGS
    const filled = validateSettings(older)
    assertEquals(filled.ok && filled.settings[field], missing, `${field} when missing`)
    const kept = validateSettings({ ...DEFAULT_SETTINGS, [field]: valid })
    assertEquals(kept.ok && kept.settings[field], valid, `${field} = ${valid}`)
    assertEquals(
      validateSettings({ ...DEFAULT_SETTINGS, [field]: invalid }).ok,
      false,
      `${field} = ${invalid}`,
    )
  }
})

Deno.test('validateSettings upscales where pictures are made, unless Upscale has its own backend', () => {
  const { upscaleBackend: _, ...older } = DEFAULT_SETTINGS
  const comfyui = { ...older, imageBackend: 'comfyui', imageModel: 'qwen-image-2.1' }
  const follows = validateSettings(comfyui)
  assertEquals(follows.ok && follows.settings.upscaleBackend, 'comfyui')
  // A Mac rendering with mflux and upscaling on a ComfyUI machine.
  const split = validateSettings({ ...DEFAULT_SETTINGS, upscaleBackend: 'comfyui' })
  assertEquals(split.ok && [split.settings.imageBackend, split.settings.upscaleBackend], [
    'mflux',
    'comfyui',
  ])
  assertEquals(validateSettings({ ...DEFAULT_SETTINGS, upscaleBackend: 'esrgan' }).ok, false)
})

Deno.test('Where mflux and the voice service cannot run, Settings default to ComfyUI', () => {
  const pc = machineDefaults({ mflux: false, voiceService: false })
  assertEquals(
    [pc.imageBackend, pc.upscaleBackend, pc.voiceBackend, pc.imageModel],
    ['comfyui', 'comfyui', 'comfyui', 'qwen-image-2.1'],
  )
  assertEquals(validateSettings(pc).ok, true)
  assertEquals(machineDefaults({ mflux: true, voiceService: true }), DEFAULT_SETTINGS)
})

Deno.test("An older file's missing backends: Upscale follows its pictures, voices this machine", () =>
  withTempDir(async (dir) => {
    const path = join(dir, 'settings.json')
    // Pictures on ComfyUI, from before Upscale and voices had backends of their own.
    const { upscaleBackend: _u, voiceBackend: _v, ...older } = DEFAULT_SETTINGS
    await Deno.writeTextFile(path, JSON.stringify({ ...older, imageBackend: 'comfyui' }))
    const pc = fileSettingsStore(path, machineDefaults({ mflux: false, voiceService: false }))
    const onPc = await pc.load()
    assertEquals([onPc.upscaleBackend, onPc.voiceBackend], ['comfyui', 'comfyui'])
    const mac = await fileSettingsStore(path).load()
    assertEquals([mac.upscaleBackend, mac.voiceBackend], ['comfyui', 'mlx-audio'])
  }))
