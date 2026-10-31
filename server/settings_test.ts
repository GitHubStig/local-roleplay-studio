import { assertEquals } from '@std/assert'
import { join, toFileUrl } from '@std/path'
import {
  DEFAULT_SETTINGS,
  fileSettingsStore,
  machineDefaults,
  renderSettings,
  sessionSettingsOf,
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

/** Settings with LM Studio listed, which takes an API key. */
const withLmStudio = {
  ...DEFAULT_SETTINGS,
  backends: [
    ...DEFAULT_SETTINGS.backends,
    { id: 'lm', kind: 'openai' as const, address: 'http://localhost:1234/v1' },
  ],
  textModel: 'llama3:latest',
}

Deno.test("fileSettingsStore keeps each Backend's API key in the file but out of Settings", () =>
  withTempDir(async (dir) => {
    const path = join(dir, 'settings.json')
    const store = fileSettingsStore(path)
    await store.saveApiKey('lm', 'sk-secret')
    await store.save(withLmStudio)
    assertEquals(await store.loadApiKey('lm'), 'sk-secret') // saving Settings keeps it
    assertEquals(await store.loadApiKey('ollama'), '')
    assertEquals('apiKeys' in await store.load(), false)
    assertEquals(JSON.parse(await Deno.readTextFile(path)).apiKeys, { lm: 'sk-secret' })
    // Windows has no Unix modes: the file takes the folder's permissions there.
    if (Deno.build.os !== 'windows') assertEquals((await Deno.stat(path)).mode! & 0o777, 0o600)
    await store.saveApiKey('lm', '')
    assertEquals(await store.loadApiKey('lm'), '')
    assertEquals((await store.load()).textModel, 'llama3:latest')
    // A Backend taken off the list takes its key with it.
    await store.saveApiKey('lm', 'sk-secret')
    await store.save(DEFAULT_SETTINGS)
    assertEquals(await store.loadApiKey('lm'), '')
  }))

Deno.test('fileSettingsStore keeps both Settings and an API key saved at the same time', () =>
  withTempDir(async (dir) => {
    const store = fileSettingsStore(join(dir, 'settings.json'))
    await Promise.all([store.save(withLmStudio), store.saveApiKey('lm', 'sk-secret')])
    assertEquals(await store.load(), withLmStudio)
    assertEquals(await store.loadApiKey('lm'), 'sk-secret')
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

Deno.test('A Session keeps only its models, and renders with them and the rest as now', () => {
  const started = {
    ...DEFAULT_SETTINGS,
    textModel: 'gemma4',
    imageModel: 'flux2-klein-4b',
    steps: 4,
  }
  const session = sessionSettingsOf(started)
  assertEquals(session, {
    textModel: 'gemma4',
    thinking: false,
    imageModel: 'flux2-klein-4b',
    steps: 4,
  })
  const now = {
    ...DEFAULT_SETTINGS,
    imageModel: 'krea-2',
    steps: 8,
    size: 'landscape',
    stepCache: null,
    quantize: 8 as const,
  }
  assertEquals(renderSettings(session, now), { ...now, imageModel: 'flux2-klein-4b', steps: 4 })
})

Deno.test('validateSettings fills in what an older file lacks, keeps what it may be, refuses the rest', () => {
  // Each field: what it comes to when missing, a value it may take, and one it may not.
  const fields: [keyof typeof DEFAULT_SETTINGS, unknown, unknown, unknown][] = [
    ['thinking', false, true, 'yes'],
    ['upscaler', 'seedvr2-7b', 'seedvr2-3b', 'esrgan'],
    ['limits', true, false, 'no'],
    ['artModel', '', 'gemma4:31b-mlx', 3],
    ['stepCache', 0.4, null, 0.9],
    ['editQuantize', 8, null, 6],
    ['float16', 'auto', 'on', 'yes'],
    ['previews', true, false, 'yes'],
    ['sessionsFolder', '', '/Users/me/Sessions', 'Sessions'],
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

Deno.test('validateSettings drops Fast from a file made before turbos were Image Models', () => {
  const older = validateSettings({ ...DEFAULT_SETTINGS, fast: true })
  assertEquals(older.ok && 'fast' in older.settings, false)
})

Deno.test('validateSettings checks the Backends, and always lists this machine', () => {
  const ollama = DEFAULT_SETTINGS.backends[1]
  /** What's wrong with these Backends listed after Ollama, which Settings send text to. */
  const issues = (backends: unknown) => {
    const listed = Array.isArray(backends) ? [ollama, ...backends] : backends
    const result = validateSettings({ ...DEFAULT_SETTINGS, backends: listed })
    return result.ok ? [] : result.issues
  }
  // This machine's own, when left out, comes first.
  const filled = validateSettings({ ...DEFAULT_SETTINGS, backends: [ollama] })
  assertEquals(filled.ok && filled.settings.backends, DEFAULT_SETTINGS.backends)
  assertEquals(issues([ollama]), ['Each Backend needs an id of its own'])
  assertEquals(issues([{ id: 'x', kind: 'a1111', address: '' }]), [
    "Backend x's kind must be one of: here, comfyui, ollama, openai",
  ])
  assertEquals(issues([{ id: 'pc', kind: 'here', address: '' }]), [
    'Only this machine\'s own Backend is "here"',
  ])
  assertEquals(issues([{ id: 'pc', kind: 'comfyui', address: 'http://pc:8188' }]), [])
  assertEquals(issues([{ id: 'pc', kind: 'comfyui', address: 'not an address' }]), [
    "Backend pc's address must be like http://127.0.0.1:8188",
  ])
  assertEquals(issues('ollama')[0], 'backends must be a list')
})

Deno.test('Where mflux and the voice service cannot run, Settings default to a ComfyUI here', () => {
  const pc = machineDefaults({ mflux: false, voiceService: false })
  assertEquals(pc.backends.map((b) => [b.kind, b.address]), [
    ['here', ''],
    ['ollama', ''],
    ['comfyui', ''],
  ])
  assertEquals(pc.runOn, {
    text: 'ollama',
    images: 'comfyui',
    upscale: 'comfyui',
    edits: 'comfyui',
    voices: 'comfyui',
  })
  assertEquals([pc.editModel, pc.imageModel], ['qwen-image-2.1-edit', 'qwen-image-2.1'])
  assertEquals(validateSettings(pc).ok, true)
  assertEquals(machineDefaults({ mflux: true, voiceService: true }), DEFAULT_SETTINGS)
})

Deno.test('A file from before the Backends list loads with the defaults for them', () =>
  withTempDir(async (dir) => {
    const path = join(dir, 'settings.json')
    const { backends: _b, runOn: _r, ...rest } = DEFAULT_SETTINGS
    await Deno.writeTextFile(
      path,
      JSON.stringify({ ...rest, textModel: 'llama3:latest', imageBaseUrl: 'http://pc:8188' }),
    )
    const warn = console.warn
    const warned: string[] = []
    console.warn = (message: string) => warned.push(message)
    try {
      const loaded = await fileSettingsStore(path).load()
      assertEquals(loaded, { ...DEFAULT_SETTINGS, textModel: 'llama3:latest' })
    } finally {
      console.warn = warn
    }
    // The address is left for the player to add as a Backend, and the log says so.
    assertEquals(warned.length, 1)
    assertEquals(warned[0].includes('imageBaseUrl are ignored'), true)
  }))

Deno.test("validateSettings reads an older file's float16 true as Automatic and false as off", () => {
  const float16 = (value: unknown) => {
    const result = validateSettings({ ...DEFAULT_SETTINGS, float16: value })
    return result.ok && result.settings.float16
  }
  assertEquals(float16(true), 'auto')
  assertEquals(float16(false), 'off')
})

Deno.test('Clips may name a ComfyUI to go to, one on the Machines tab', () => {
  const comfy = { id: 'pc', kind: 'comfyui' as const, address: 'http://192.0.2.20:8188' }
  const backends = [...DEFAULT_SETTINGS.backends, comfy]
  const ok = validateSettings({ ...DEFAULT_SETTINGS, backends, videoOn: 'pc' })
  assertEquals(ok.ok && ok.settings.videoOn, 'pc')
  const none = validateSettings({ ...DEFAULT_SETTINGS, backends })
  assertEquals(none.ok && 'videoOn' in none.settings, false)
  for (const videoOn of ['gone', 'ollama']) {
    const bad = validateSettings({ ...DEFAULT_SETTINGS, backends, videoOn })
    assertEquals(bad.ok ? [] : bad.issues, ['videoOn must be a ComfyUI on the Machines tab'])
  }
})
