import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import ThemeButton from './ThemeButton.vue'

describe('ThemeButton', () => {
  beforeEach(() => localStorage.clear())

  it('steps through Light, Dark and System, its icon showing which is on', async () => {
    const wrapper = mount(ThemeButton)
    const now = () => [
      wrapper.attributes('data-theme-button'),
      wrapper.find('[data-icon]').attributes('data-icon'),
    ]
    expect(now()).toEqual(['system', 'monitor'])
    await wrapper.trigger('click')
    expect(now()).toEqual(['light', 'sun'])
    expect(localStorage.getItem('theme')).toBe('light')
    await wrapper.trigger('click')
    expect(now()).toEqual(['dark', 'moon'])
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    await wrapper.trigger('click')
    expect(now()).toEqual(['system', 'monitor'])
    expect(localStorage.getItem('theme')).toBeNull()
    expect(wrapper.attributes('title')).toBe('Theme: System (click for Light)')
  })
})
