import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import PopMenu from './PopMenu.vue'

const mountMenu = () =>
  mount(PopMenu, {
    attachTo: document.body,
    slots: {
      button: ({ toggle }: { toggle: () => void }) =>
        h('button', { 'data-b': '', onClick: toggle }),
      default: ({ close }: { close: () => void }) =>
        h('button', { 'data-item': '', onClick: close }),
    },
  })

describe('PopMenu', () => {
  it('opens on its button, and closes on it again, on Esc, on a click outside, or from inside', async () => {
    const wrapper = mountMenu()
    const open = () => wrapper.find('[data-pop-panel]').exists()
    expect(open()).toBe(false)
    await wrapper.find('[data-b]').trigger('click')
    expect([open(), wrapper.attributes('data-open')]).toEqual([true, 'true'])
    await wrapper.find('[data-b]').trigger('click')
    expect(open()).toBe(false)

    await wrapper.find('[data-b]').trigger('click')
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(open()).toBe(false)

    await wrapper.find('[data-b]').trigger('click')
    // VueUse's listener takes one click per turn, and the button's was this turn's.
    await new Promise((resolve) => setTimeout(resolve))
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(open()).toBe(false)

    await wrapper.find('[data-b]').trigger('click')
    await wrapper.find('[data-item]').trigger('click')
    expect(open()).toBe(false)
    wrapper.unmount()
  })
})
