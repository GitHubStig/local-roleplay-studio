import { describe, expect, it, vi } from 'vitest'
import type { Job } from './api'
import { formingOf, jobForming, jobStatus, openJob, renderSteps } from './jobs'

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

describe('openJob', () => {
  it("opens a reference sheet's job on the Look where a screen has one, else on its Frame", () => {
    const sheet = {
      id: 'j',
      kind: 'sheet',
      frameIndex: 0,
      status: 'running',
      sheet: { subject: 'Kael' },
    } as Job
    const places = { go: vi.fn(), edit: vi.fn(), clip: vi.fn(), drop: vi.fn(), look: vi.fn() }
    openJob(sheet, places)
    expect([places.look.mock.calls.length, places.go.mock.calls.length]).toEqual([1, 0])
    const { look: _, ...noLook } = places
    openJob(sheet, noLook)
    expect(places.go).toHaveBeenCalledWith(0)
  })
})

describe('A render with a face pass', () => {
  const render = (faces: Job['faces'], status: Job['status'] = 'running'): Job => ({
    id: 'j1',
    kind: 'render',
    frameIndex: 3,
    status,
    createdAt: '',
    machine: 'here',
    ...(status === 'running' && { phase: 'faces' as const, progress: { step: 30, total: 50 } }),
    faces,
  })

  it('says its two steps: rendered, then whose faces', () => {
    const job = render({ subjects: ['Kael', 'Elara Vance'] })
    expect(jobStatus(job)).toBe('Faces · Kael and Elara Vance… step 30 of 50')
    expect(renderSteps(job, 'Rendered')).toEqual([
      { text: 'Rendered', state: 'done' },
      { text: 'Faces · Kael and Elara Vance', state: 'running' },
    ])
  })

  it('says the faces were skipped, and why', () => {
    const job = render(
      { subjects: [], skipped: 'No one with a sheet in it: saved as rendered.' },
      'done',
    )
    expect(jobStatus(job)).toBe('Faces skipped')
    expect(renderSteps(job, 'Rendered')[1]).toEqual({
      text: 'Faces skipped',
      state: 'skipped',
      note: 'No one with a sheet in it: saved as rendered.',
    })
  })

  it("says whose head wasn't found", () => {
    const job = render({ subjects: ['Kael'], missed: ['Elara Vance'] }, 'done')
    expect(jobStatus(job)).toBe('Done · faces of Kael')
    expect(renderSteps(job, 'Rendered')[1].note).toBe(
      'Elara Vance: no head found, left as rendered.',
    )
  })
})

describe('An edit with a face pass', () => {
  const edit = (faces: Job['faces']): Job => ({
    id: 'j2',
    kind: 'edit',
    frameIndex: 3,
    status: 'done',
    createdAt: '',
    machine: 'here',
    edit: { instruction: 'A low angle.', camera: true },
    faces,
  })

  it('says its two steps: edited, then whose faces', () => {
    const job = edit({ subjects: ['Kael'], missed: ['Elara Vance'] })
    expect(renderSteps(job, 'Edited')).toEqual([
      { text: 'Edited', state: 'done' },
      { text: 'Faces · Kael', state: 'done', note: 'Elara Vance: no head found, left as edited.' },
    ])
  })

  it('is plainly done when its area touched no face', () => {
    const job = edit({ subjects: [], skipped: 'The edit touched no face.', untouched: true })
    expect(jobStatus(job)).toBe('Done')
  })
})
