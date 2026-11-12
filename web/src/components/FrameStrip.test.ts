import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FrameStrip from './FrameStrip.vue'

describe('FrameStrip', () => {
  it("shows each Frame's picture, or its words without one, rings the picked and picks on click", async () => {
    const wrapper = mount(FrameStrip, {
      props: {
        picked: 1,
        tiles: [
          { index: 0, thumb: '/a.png', clips: 2 },
          { index: 1, words: 'I sit by the fire', working: 'queued' },
        ],
      },
    })
    const [first, second] = wrapper.findAll('[data-tile]')
    expect(first.find('img').attributes('src')).toBe('/a.png')
    expect(first.text().replace(/\s+/g, '')).toBe('12')
    expect(second.find('img').exists()).toBe(false)
    expect(second.text()).toContain('I sit by the fire')
    expect([first.attributes('aria-current'), second.attributes('aria-current')]).toEqual([
      'false',
      'true',
    ])
    expect(second.classes()).toContain('render-sweep')
    expect(second.attributes('data-rendering')).toBe('queued')
    await first.trigger('click')
    expect(wrapper.emitted('pick')).toEqual([[0]])
  })
})
