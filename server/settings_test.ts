import { assertEquals } from '@std/assert'
import { join, toFileUrl } from '@std/path'
import { DEFAULT_SETTINGS, fileSettingsStore, validateSettings } from './settings.ts'

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

Deno.test('validateSettings defaults thinking to off and rejects non-booleans', () => {
  const { thinking: _, ...withoutThinking } = DEFAULT_SETTINGS
  const result = validateSettings(withoutThinking)
  assertEquals(result.ok && result.settings.thinking, false)
  assertEquals(validateSettings({ ...DEFAULT_SETTINGS, thinking: 'yes' }).ok, false)
  const on = validateSettings({ ...DEFAULT_SETTINGS, thinking: true })
  assertEquals(on.ok && on.settings.thinking, true)
})

Deno.test('validateSettings defaults the upscaler to SeedVR2 7B and accepts only known ones', () => {
  const { upscaler: _, ...withoutUpscaler } = DEFAULT_SETTINGS
  const result = validateSettings(withoutUpscaler)
  assertEquals(result.ok && result.settings.upscaler, 'seedvr2-7b')
  const small = validateSettings({ ...DEFAULT_SETTINGS, upscaler: 'seedvr2-3b' })
  assertEquals(small.ok && small.settings.upscaler, 'seedvr2-3b')
  assertEquals(validateSettings({ ...DEFAULT_SETTINGS, upscaler: 'esrgan' }).ok, false)
})

Deno.test('validateSettings keeps the Limits on unless turned off', () => {
  const { limits: _, ...withoutLimits } = DEFAULT_SETTINGS
  const result = validateSettings(withoutLimits)
  assertEquals(result.ok && result.settings.limits, true)
  const off = validateSettings({ ...DEFAULT_SETTINGS, limits: false })
  assertEquals(off.ok && off.settings.limits, false)
  assertEquals(validateSettings({ ...DEFAULT_SETTINGS, limits: 'no' }).ok, false)
})
