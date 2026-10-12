import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ExportPage from './ExportPage.vue'

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
})
