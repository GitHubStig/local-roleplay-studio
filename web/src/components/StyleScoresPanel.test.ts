import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getStyleScores, type Job, listJobs, queueJob } from '../api'
import type { StyleScores } from '../styleScores'
import StyleScoresPanel from './StyleScoresPanel.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getSettingsOptions: vi.fn(() => new Promise(() => {})),
  getSettings: vi.fn(() => new Promise(() => {})),
  getStyleScores: vi.fn(),
  listJobs: vi.fn(),
  queueJob: vi.fn(),
}))

enableAutoUnmount(afterEach)

const scores: StyleScores = {
  base: 2,
  frames: [0, 1, 2],
  unembedded: 0,
  models: [
    {
      model: 'a',
      spread: 0.4,
      fromBase: 0.35,
      styles: 5.2,
      matches: { first: 0.3, topThree: 0.6 },
      fromBaseByFrame: [0.3, 0.4, 0],
      captionRank: [1, 2, 1],
    },
    { model: 'b', spread: 0.2, fromBase: 0.1, styles: 2.1, fromBaseByFrame: [0.1, 0.1, 0] },
  ],
}
const job: Job = {
  id: 'j1',
  kind: 'style',
  frameIndex: 0,
  status: 'running',
  createdAt: '2026-10-14T00:00:00.000Z',
  progress: { step: 8, total: 30 },
}

const mountIt = (more: { shared?: number[]; pictured?: Record<string, number> } = {}) =>
  mount(StyleScoresPanel, {
    props: {
      sessionId: 's1',
      models: ['a', 'b'],
      shared: more.shared ?? [0, 1, 2],
      pictured: more.pictured ?? { a: 3, b: 3 },
      frames: [0, 1, 2].map((index) => ({
        index,
        name: `Frame ${index}`,
        caption: index === 1
          ? 'Art style: a very long description of a pixel art look, in sixteen colours.'
          : undefined,
      })),
      labelOf: (m: string) => m.toUpperCase(),
    },
  })

describe('StyleScoresPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('says the Session isn’t scored yet, then scores it in the background and shows the numbers', async () => {
    vi.mocked(getStyleScores).mockRejectedValueOnce(new ApiError('Not scored yet', 404))
    vi.mocked(listJobs).mockResolvedValueOnce([])
    const wrapper = mountIt()
    await flushPromises()
    expect(wrapper.text()).toContain('Not scored yet')
    expect(wrapper.find('[data-style-score]').text()).toBe('Score')

    vi.mocked(queueJob).mockResolvedValueOnce([job])
    await wrapper.find('[data-style-score]').trigger('click')
    await flushPromises()
    expect(queueJob).toHaveBeenCalledWith('s1', 'style', 0)
    expect(wrapper.text()).toContain('Embedding the pictures… 8 of 30')
    expect(wrapper.find('[data-style-score]').attributes('disabled')).toBeDefined()

    vi.mocked(listJobs).mockResolvedValueOnce([])
    vi.mocked(getStyleScores).mockResolvedValueOnce(scores)
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()
    const rows = wrapper.findAll('[data-style-table] tbody tr').map((r) =>
      r.findAll('td').map((c) => c.text())
    )
    expect(rows).toEqual([
      ['A', '0.40', '0.35', '5.2', '60%'],
      ['B', '0.20', '0.10', '2.1', '–'],
    ])
    expect(wrapper.find('[data-style-score]').text()).toBe('Score again')
  })

  it('asks again for the scores against the base Frame picked, and remembers it', async () => {
    vi.mocked(getStyleScores).mockResolvedValue(scores)
    vi.mocked(listJobs).mockResolvedValue([])
    const wrapper = mountIt()
    await flushPromises()
    expect(getStyleScores).toHaveBeenLastCalledWith('s1', 0, ['a', 'b'])
    expect(wrapper.findAll('[data-style-base] option').map((o) => o.text())).toEqual([
      'Frame 0',
      'Frame 1 · Art style: a very long description of a pixel art look, in…',
      'Frame 2',
    ])
    const select = wrapper.find('[data-style-base]')
    ;(select.element as HTMLSelectElement).selectedIndex = 2
    await select.trigger('change')
    await flushPromises()
    expect(getStyleScores).toHaveBeenLastCalledWith('s1', 2, ['a', 'b'])
    expect(localStorage.getItem('style-base:s1')).toBe('2')
  })

  it('names the models that leave fewer than two Frames in common, without asking the server', async () => {
    vi.mocked(getStyleScores).mockClear()
    vi.mocked(listJobs).mockResolvedValue([])
    const wrapper = mountIt({ shared: [1], pictured: { a: 3, b: 1 } })
    await flushPromises()
    expect(wrapper.find('[data-style-problem]').text()).toBe(
      'B pictured only 1 Frame: hide its column to compare the rest.',
    )
    expect(getStyleScores).not.toHaveBeenCalled()
    // The base Frame can only be one they share.
    expect(wrapper.findAll('[data-style-base] option').map((o) => o.text())).toEqual([
      'Frame 1 · Art style: a very long description of a pixel art look, in…',
    ])
  })
})
