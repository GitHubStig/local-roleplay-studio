import { afterEach, describe, expect, it, vi } from 'vitest'
import { getHealth } from './api'

afterEach(() => vi.unstubAllGlobals())

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
