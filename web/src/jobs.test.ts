import { describe, expect, it } from 'vitest'
import type { Job } from './api'
import { formingOf, jobForming, queueTabLabel } from './jobs'

const session = { id: 's1' }

describe('formingOf', () => {
  it('shows ComfyUI renders forming, more opaque as the steps go', () => {
    expect(formingOf(session, 'image', { step: 5, total: 25 }, 'comfyui')).toEqual({
      src: '/api/sessions/s1/preview?step=5',
      opacity: 0.2,
    })
  })

  it('shows nothing for mflux or before a render says where, before the first step, or outside the image phase', () => {
    expect(formingOf(session, 'image', { step: 5, total: 25 }, 'mflux')).toBeNull()
    expect(formingOf(session, 'image', { step: 5, total: 25 }, undefined)).toBeNull()
    expect(formingOf(session, 'image', undefined, 'comfyui')).toBeNull()
    expect(formingOf(session, 'queued', { step: 5, total: 25 }, 'comfyui')).toBeNull()
    expect(formingOf(null, 'image', { step: 5, total: 25 }, 'comfyui')).toBeNull()
  })

  it('takes renders and pictures from jobs on ComfyUI, not upscales', () => {
    const job = (kind: Job['kind'], imageBackend: Job['imageBackend'] = 'comfyui') =>
      ({ kind, phase: 'image', progress: { step: 1, total: 2 }, imageBackend }) as Job
    expect(jobForming(session, job('render'))?.opacity).toBe(0.5)
    expect(jobForming(session, job('picture'))?.opacity).toBe(0.5)
    expect(jobForming(session, job('render', 'mflux'))).toBeNull()
    expect(jobForming(session, job('upscale'))).toBeNull()
    expect(jobForming(session, null)).toBeNull()
  })
})

describe('queueTabLabel', () => {
  const job = (status: Job['status']) => ({ status }) as Job

  it('counts the open jobs, and the done and failed ones apart', () => {
    expect(queueTabLabel([])).toBe('Queue')
    expect(queueTabLabel([job('running'), job('queued')])).toBe('Queue (2)')
    expect(queueTabLabel([job('failed'), job('failed')])).toBe('Queue (2 failed)')
    expect(queueTabLabel([job('running'), job('failed')])).toBe('Queue (1, 1 failed)')
    expect(queueTabLabel([job('done'), job('done'), job('queued')])).toBe('Queue (1, 2 done)')
  })
})
