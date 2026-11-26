import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import SubjectSheet from './SubjectSheet.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  changeSheet: vi.fn(),
}))

const made: api.Sheet = {
  subject: 'Kael',
  ticked: true,
  identity: 'Kael, a lean man with old scars.',
  seed: 7,
  made: {
    file: 'sheet-kael-12345678.png',
    views: ['a', 'b', 'c'],
    mirrored: ['d', 'e', 'f'],
    imageModel: 'qwen-image-2.1',
    createdAt: '2026-11-25T00:00:00.000Z',
  },
}

const job = (extra: Partial<api.Job>): api.Job =>
  ({
    id: 'j1',
    kind: 'sheet',
    frameIndex: 0,
    status: 'running',
    phase: 'image',
    sheet: { subject: 'Kael' },
    ...extra,
  }) as api.Job

const shown = (props: Partial<InstanceType<typeof SubjectSheet>['$props']> = {}) =>
  mount(SubjectSheet, {
    props: {
      sessionId: 'r1',
      subject: 'Kael',
      identity: made.identity,
      sheet: made,
      settled: false,
      settledText: 'Settled when the story began. Restart to change it.',
      ...props,
    },
  })

beforeEach(() => {
  vi.mocked(api.changeSheet).mockReset()
})

describe('SubjectSheet', () => {
  it('shows the sheet, with Redo and Change…', async () => {
    const wrapper = shown()
    expect(wrapper.find('[data-sheet-image]').attributes('src')).toBe(
      '/api/sessions/r1/images/sheet-kael-12345678.png',
    )
    await wrapper.find('[data-sheet-redo]').trigger('click')
    expect(wrapper.emitted('redo')).toHaveLength(1)
  })

  it("says how its job goes while it's made, and why it failed", () => {
    const { made: _, ...unmade } = made
    const queued = shown({ sheet: unmade, job: job({ status: 'queued', phase: undefined }) })
    expect(queued.find('[data-sheet-making]').text()).toBe("Making Kael's sheet · queued")
    const rendering = shown({
      sheet: unmade,
      job: job({ progress: { step: 3, total: 25 } } as Partial<api.Job>),
    })
    expect(rendering.find('[data-sheet-making]').text()).toBe(
      "Making Kael's sheet · rendering, step 3 of 25",
    )
    expect(rendering.find<HTMLButtonElement>('[data-sheet-redo]').element.disabled).toBe(true)
    const failed = shown({ sheet: unmade, job: job({ status: 'failed', error: 'mflux quit' }) })
    expect(failed.find('[data-sheet-failed]').text()).toBe("Couldn't make it: mflux quit")
  })

  it('says why a sheet was found unfit twice, and that it is used as it is', () => {
    const flawed = { ...made, made: { ...made.made!, flaw: 'It has writing on it: “Kael,”.' } }
    const flaw = shown({ sheet: flawed }).find('[data-sheet-flaw]')
    expect(flaw.text()).toContain('unfit both times: It has writing on it: “Kael,”.')
    expect(flaw.text()).toContain('Redo, or Change… it')
    // Settled, it still says why, but not what to do.
    expect(shown({ sheet: flawed, settled: true }).find('[data-sheet-flaw]').text()).not.toContain(
      'Redo',
    )
    expect(shown().find('[data-sheet-flaw]').exists()).toBe(false)
  })

  it('greys an unticked sheet and its buttons; settled, shows it alone with how to change it', () => {
    const off = shown({ sheet: { ...made, ticked: false } })
    expect(off.find<HTMLButtonElement>('[data-sheet-redo]').element.disabled).toBe(true)
    expect(off.find<HTMLButtonElement>('[data-sheet-change]').element.disabled).toBe(true)
    const settled = shown({ settled: true })
    expect(settled.find('[data-sheet-redo]').exists()).toBe(false)
    expect(settled.find('[data-sheet-settled]').text()).toContain('Restart to change it')
  })

  it('Change… rewrites the identity with a note, shows what changed, then asks for the sheet from it', async () => {
    vi.mocked(api.changeSheet).mockImplementation((_id, _subject, _note, onEvent) => {
      onEvent({ type: 'phase', phase: 'text' })
      onEvent({
        type: 'identity',
        subject: 'Kael',
        identity: 'Kael, a lean man, grey at the temples.',
      })
      return Promise.resolve()
    })
    const wrapper = shown()
    await wrapper.find('[data-sheet-change]').trigger('click')
    await wrapper.find('[data-sheet-note]').setValue('grey at the temples, no scars')
    await wrapper.find('[data-sheet-changing]').trigger('submit')
    await flushPromises()
    expect(api.changeSheet).toHaveBeenCalledWith(
      'r1',
      'Kael',
      'grey at the temples, no scars',
      expect.any(Function),
    )
    // What's new is marked; nothing is saved until the player asks for the sheet.
    expect(wrapper.find('[data-sheet-rewritten]').text()).toBe(
      'Kael, a lean man, grey at the temples.',
    )
    expect(wrapper.findAll('[data-diff="added"]').map((p) => p.text())).toEqual([
      'man, grey at the temples.',
    ])
    expect(wrapper.emitted('change')).toBeUndefined()
    await wrapper.find('[data-sheet-changing]').trigger('submit')
    expect(wrapper.emitted('change')).toEqual([['Kael, a lean man, grey at the temples.']])
    expect(wrapper.find('[data-sheet-changing]').exists()).toBe(false)
  })

  it('Change… says why it was refused, and Cancel leaves the identity as it was', async () => {
    vi.mocked(api.changeSheet).mockRejectedValue(new Error('Declined: crosses a Limit'))
    const wrapper = shown()
    await wrapper.find('[data-sheet-change]').trigger('click')
    await wrapper.find('[data-sheet-note]').setValue('something')
    await wrapper.find('[data-sheet-changing]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('Declined: crosses a Limit')
    await wrapper.find('[data-sheet-change-cancel]').trigger('click')
    expect(wrapper.find('[data-sheet-changing]').exists()).toBe(false)
    expect(wrapper.emitted('change')).toBeUndefined()
  })
})
