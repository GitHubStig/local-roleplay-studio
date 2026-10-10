import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import Icon from './Icon.vue'

describe('Icon', () => {
  it('shows the named SVG inline, drawn in the text’s colour, hidden from screen readers', () => {
    const wrapper = mount(Icon, { props: { name: 'settings' } })
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('stroke')).toBe('currentColor')
    expect(wrapper.attributes('aria-hidden')).toBe('true')
  })

  it('warns of an icon that has no file, and shows nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(Icon, { props: { name: 'nope' } })
    expect(wrapper.find('svg').exists()).toBe(false)
    expect(warn).toHaveBeenCalledWith('No icon named "nope" in assets/icons/')
    warn.mockRestore()
  })
})
