import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExportedStyles } from '../styleScores'
import ExportPage from './ExportPage.vue'
import { loadPlot } from './plotGlobal'

vi.mock('./plotGlobal', () => ({ loadPlot: vi.fn(() => Promise.resolve()) }))

enableAutoUnmount(afterEach)

const comparison = {
  models: [{ label: 'a' }],
  rows: [{ name: 'Frame 0', pictures: [{ thumb: 'thumbs/f0.webp', full: 'images/f0.webp' }] }],
}

describe('ExportPage', () => {
  it('opens straight to the table without a notice', () => {
    const wrapper = mount(ExportPage, { props: comparison })
    expect(wrapper.find('[data-age-notice]').exists()).toBe(false)
    expect(wrapper.find('[data-export-table]').attributes('inert')).toBeUndefined()
  })

  it('keeps the table out of reach behind its notice until the visitor confirms', async () => {
    const notice = 'Some of these pictures show nude figures.'
    const wrapper = mount(ExportPage, { props: { ...comparison, notice } })
    expect(wrapper.find('[data-notice-text]').text()).toBe(notice)
    const table = () => wrapper.find('[data-export-table]')
    expect(table().attributes('inert')).toBeDefined()
    expect(table().classes()).toContain('blur-2xl')
    await wrapper.find('[data-confirm-age]').trigger('click')
    expect(wrapper.find('[data-age-notice]').exists()).toBe(false)
    expect(table().attributes('inert')).toBeUndefined()
    // Nothing is remembered: the next visit asks again.
    expect(localStorage.length).toBe(0)
    expect(
      mount(ExportPage, { props: { ...comparison, notice } }).find('[data-age-notice]').exists(),
    )
      .toBe(true)
  })

  const styles: ExportedStyles = {
    scores: {
      base: 0,
      frames: [0],
      unembedded: 0,
      models: [{ model: 'a', spread: 0.4, fromBase: 0, styles: 1, fromBaseByFrame: [0] }],
    },
    labels: { a: 'Model A' },
    frames: [{ index: 0, name: 'Frame 0', caption: 'The tavern' }],
  }

  it('offers the style scores only when exported with them, loading their charts when opened', async () => {
    expect(mount(ExportPage, { props: comparison }).find('[data-export-view]').exists()).toBe(false)
    const wrapper = mount(ExportPage, { props: { ...comparison, styles } })
    expect(wrapper.find('[data-export-scores]').exists()).toBe(false)
    expect(loadPlot).not.toHaveBeenCalled()
    await wrapper.findAll('[data-export-view] button')[1].trigger('click')
    await flushPromises()
    expect(loadPlot).toHaveBeenCalled()
    expect(wrapper.find('[data-export-scores]').exists()).toBe(true)
    expect(wrapper.find('[data-style-intro]').text()).toContain('Against Frame 0')
    expect(wrapper.find('[data-style-table] tbody td').text()).toBe('Model A')
    await wrapper.findAll('[data-export-view] button')[0].trigger('click')
    expect(wrapper.find('[data-export-scores]').exists()).toBe(false)
  })

  it('says so when the charts can’t load, and stays on the pictures', async () => {
    vi.mocked(loadPlot).mockRejectedValueOnce(new Error("The charts couldn't load"))
    const wrapper = mount(ExportPage, { props: { ...comparison, styles } })
    await wrapper.findAll('[data-export-view] button')[1].trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain("The charts couldn't load")
    expect(wrapper.find('[data-export-scores]').exists()).toBe(false)
  })
})
