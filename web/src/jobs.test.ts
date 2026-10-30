import { describe, expect, it } from 'vitest'
import type { Job } from './api'
import { formingOf, jobForming, queueTab } from './jobs'

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

describe('queueTab', () => {
  const job = (status: Job['status']) => ({ status }) as Job

  it('counts the failed jobs, and is busy while any is open', () => {
    expect(queueTab([])).toEqual({ label: 'Queue', busy: false })
    expect(queueTab([job('running'), job('queued')])).toEqual({ label: 'Queue', busy: true })
    expect(queueTab([job('failed'), job('failed')])).toEqual({
      label: 'Queue (2 failed)',
      busy: false,
    })
    expect(queueTab([job('running'), job('failed'), job('done')])).toEqual({
      label: 'Queue (1 failed)',
      busy: true,
    })
    expect(queueTab([job('done')]).busy).toBe(false)
  })
})
