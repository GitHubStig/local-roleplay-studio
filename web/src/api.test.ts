import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  createSseParser,
  getHealth,
  saveSettings,
  type Settings,
  streamFrame,
} from './api'
import { ALL_ON } from './testing'

afterEach(() => vi.unstubAllGlobals())

const settings: Settings = {
  textModel: 'llama3:latest',
  thinking: false,
  imageModel: 'z-image-turbo',
  steps: 9,
  size: 'portrait',
  quantize: null,
  stepCache: 0.4,
  fast: false,
  seedMode: 'random',
  seed: 42,
  upscaler: 'seedvr2-7b',
  limits: true,
  artModel: '',
  artStyle: 'prose',
  features: ALL_ON,
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
    expect(fetch).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
    )
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

describe('createSseParser', () => {
  it('parses events split across chunks', () => {
    const events: unknown[] = []
    const parse = createSseParser((e) => events.push(e))
    parse('event: phase\ndata: {"type":"phase","ph')
    parse('ase":"text"}\n\nevent: cancelled\ndata: {"type":"cancelled","sessionDiscarded":false}\n')
    expect(events).toEqual([{ type: 'phase', phase: 'text' }])
    parse('\n')
    expect(events).toHaveLength(2)
  })
})

describe('streamFrame', () => {
  const sse = (...events: object[]) =>
    new Response(events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join(''))

  it('delivers every event and sends the Action', async () => {
    const fetch = vi.fn(async () =>
      sse({ type: 'phase', phase: 'text' }, { type: 'cancelled', sessionDiscarded: false })
    )
    vi.stubGlobal('fetch', fetch)
    const events: unknown[] = []
    await streamFrame('s1', 'Sit', (e) => events.push(e))
    expect(events).toHaveLength(2)
    expect(fetch).toHaveBeenCalledWith(
      '/api/sessions/s1/frames',
      expect.objectContaining({ body: '{"action":"Sit"}' }),
    )
  })

  it('reports a stream that ends without a final event', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse({ type: 'phase', phase: 'text' })))
    const events: { type: string }[] = []
    await streamFrame('s1', null, (e) => events.push(e))
    expect(events.at(-1)?.type).toBe('failed')
  })

  it('throws when the server refuses the Frame', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'A Frame is already in progress' }, { status: 409 })
      ),
    )
    await expect(streamFrame('s1', 'Sit', () => {})).rejects.toThrow('already in progress')
  })
})
