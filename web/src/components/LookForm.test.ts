import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import LookForm, { type LookSheets } from './LookForm.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  tickSheet: vi.fn(),
  redoSheet: vi.fn(),
  changeSheet: vi.fn(),
}))

const look: api.Look = {
  subjects: [
    { name: 'Kael', identity: 'Kael, a lean man.' },
    { name: 'Elara', identity: 'Elara, a slender woman.' },
  ],
  style: 'Oil paint.',
}
const sheet = (subject: string, ticked = true): api.Sheet => ({
  subject,
  ticked,
  identity: look.subjects.find((p) => p.name === subject)!.identity,
  seed: 1,
})
const answered = { kind: 'roleplay', look } as unknown as api.StoryboardSession

function shown(sheets: Partial<LookSheets> = {}) {
  const save = vi.fn((l: api.Look) => Promise.resolve(l))
  const saved = vi.fn()
  const failed = vi.fn()
  const wrapper = mount(LookForm, {
    props: {
      look,
      save,
      idPrefix: 'roleplay.look',
      every: 'for every picture',
      kept: ['Kael', 'Elara'],
      sheets: {
        sessionId: 'r1',
        list: [sheet('Kael'), sheet('Elara', false)],
        jobs: [],
        settled: false,
        settledText: 'Settled when the story began. Restart to change it.',
        saved,
        failed,
        ...sheets,
      },
    },
  })
  return { wrapper, save, saved, failed }
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(api.tickSheet).mockReset().mockResolvedValue(answered)
  vi.mocked(api.redoSheet).mockReset().mockResolvedValue(answered)
  vi.mocked(api.changeSheet).mockReset()
})

describe("LookForm's reference sheets", () => {
  it('ticks each Subject before its name, and says when one has no sheet', async () => {
    const { wrapper, saved } = shown()
    const ticks = wrapper.findAll<HTMLInputElement>('[data-sheet-tick]')
    expect(ticks.map((t) => t.element.checked)).toEqual([true, false])
    expect(wrapper.findAll('[data-subject] summary')[1].text()).toContain(
      'no sheet: the face is left as rendered',
    )
    await ticks[1].setValue(true)
    await flushPromises()
    expect(api.tickSheet).toHaveBeenCalledWith('r1', 'Elara', true)
    expect(saved).toHaveBeenCalledWith(answered)
  })

  it("redoes a sheet, saying why it's refused", async () => {
    vi.mocked(api.redoSheet).mockRejectedValue(new Error('The sheets are settled'))
    const { wrapper, failed } = shown()
    await wrapper.find('[data-sheet="Kael"] [data-sheet-redo]').trigger('click')
    await flushPromises()
    expect(api.redoSheet).toHaveBeenCalledWith('r1', 'Kael')
    expect(failed).toHaveBeenCalledWith('The sheets are settled')
  })

  it("saves Change…'s identity in the Look, which makes the sheet again", async () => {
    vi.mocked(api.changeSheet).mockImplementation((_id, _subject, _note, onEvent) => {
      onEvent({ type: 'identity', subject: 'Kael', identity: 'Kael, a lean man, greying.' })
      return Promise.resolve()
    })
    const { wrapper, save } = shown()
    const kael = wrapper.find('[data-sheet="Kael"]')
    await kael.find('[data-sheet-change]').trigger('click')
    await kael.find('[data-sheet-note]').setValue('greying')
    await kael.find('[data-sheet-changing]').trigger('submit')
    await flushPromises()
    await kael.find('[data-sheet-changing]').trigger('submit')
    await flushPromises()
    expect(save).toHaveBeenLastCalledWith({
      ...look,
      subjects: [{ name: 'Kael', identity: 'Kael, a lean man, greying.' }, look.subjects[1]],
    })
  })

  it("shows a sheet's open job over a failed one, and a failure only while there's no sheet", () => {
    const job = (status: api.Job['status'], id: string) =>
      ({
        id,
        kind: 'sheet',
        frameIndex: 0,
        status,
        sheet: { subject: 'Kael' },
        error: 'mflux quit',
      }) as api.Job
    const redone = shown({ jobs: [job('failed', 'a'), job('running', 'b')] })
    expect(redone.wrapper.find('[data-sheet="Kael"] [data-sheet-making]').exists()).toBe(true)
    const failed = shown({ jobs: [job('failed', 'a')] })
    expect(failed.wrapper.find('[data-sheet="Kael"] [data-sheet-failed]').exists()).toBe(true)
    const madeSince = shown({
      list: [{
        ...sheet('Kael'),
        made: {
          file: 'sheet-kael-1.png',
          views: ['a', 'b', 'c'],
          mirrored: ['d', 'e', 'f'],
          imageModel: 'q',
          createdAt: '',
        },
      }, sheet('Elara')],
      jobs: [job('failed', 'a')],
    })
    expect(madeSince.wrapper.find('[data-sheet="Kael"] [data-sheet-failed]').exists()).toBe(false)
  })

  it('once settled, shows the sheets alone: no ticks, an unticked one left out', () => {
    const { wrapper } = shown({ settled: true })
    expect(wrapper.find('[data-sheet-tick]').exists()).toBe(false)
    expect(wrapper.find('[data-sheet="Kael"] [data-sheet-settled]').exists()).toBe(true)
    expect(wrapper.find('[data-sheet="Elara"]').exists()).toBe(false)
  })
})
