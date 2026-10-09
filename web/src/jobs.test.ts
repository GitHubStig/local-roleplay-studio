import { describe, expect, it } from 'vitest'
import type { Job } from './api'
import { formingOf, jobForming } from './jobs'

const comfy = { id: 's1', settings: { imageBackend: 'comfyui' as const } }
const mflux = { id: 's1', settings: { imageBackend: 'mflux' as const } }

describe('formingOf', () => {
  it('shows ComfyUI renders forming, more opaque as the steps go', () => {
    expect(formingOf(comfy, 'image', { step: 5, total: 25 })).toEqual({
      src: '/api/sessions/s1/preview?step=5',
      opacity: 0.2,
    })
  })

  it('shows nothing for mflux, before the first step, or outside the image phase', () => {
    expect(formingOf(mflux, 'image', { step: 5, total: 25 })).toBeNull()
    expect(formingOf(comfy, 'image', undefined)).toBeNull()
    expect(formingOf(comfy, 'queued', { step: 5, total: 25 })).toBeNull()
    expect(formingOf(null, 'image', { step: 5, total: 25 })).toBeNull()
  })

  it('takes renders and pictures from jobs, not upscales', () => {
    const job = (kind: Job['kind']) =>
      ({ kind, phase: 'image', progress: { step: 1, total: 2 } }) as Job
    expect(jobForming(comfy, job('render'))?.opacity).toBe(0.5)
    expect(jobForming(comfy, job('picture'))?.opacity).toBe(0.5)
    expect(jobForming(comfy, job('upscale'))).toBeNull()
    expect(jobForming(comfy, null)).toBeNull()
  })
})
