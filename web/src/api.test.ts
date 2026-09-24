import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getHealth, saveSettings, type Settings } from './api'

afterEach(() => vi.unstubAllGlobals())

const settings: Settings = {
  textModel: 'llama3:latest',
  imageModel: 'z-image-turbo',
  steps: 9,
  size: 'portrait',
  quantize: null,
  seedMode: 'random',
  seed: 42,
}

describe('getHealth', () => {
  it('returns the server health payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true })))
    await expect(getHealth()).resolves.toEqual({ ok: true })
  })

  it('throws when the server responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 502 })))
    await expect(getHealth()).rejects.toThrow('502')
  })
})

describe('saveSettings', () => {
  it('PUTs the settings as JSON', async () => {
    const fetch = vi.fn(async () => Response.json(settings))
    vi.stubGlobal('fetch', fetch)
    await expect(saveSettings(settings)).resolves.toEqual(settings)
    expect(fetch).toHaveBeenCalledWith('/api/settings', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify(settings),
    }))
  })

  it('surfaces validation issues from the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'Invalid settings', issues: ['steps bad'] }, { status: 400 })
      ),
    )
    const err = await saveSettings(settings).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.issues).toEqual(['steps bad'])
  })
})
