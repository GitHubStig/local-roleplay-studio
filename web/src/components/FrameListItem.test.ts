import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FrameListItem from './FrameListItem.vue'

describe('FrameListItem', () => {
  it('shows how many clips the picture has on its corner, and none when it has none', () => {
    const withClips = mount(FrameListItem, { props: { thumb: '/a.png', number: 3, clips: 2 } })
    expect(withClips.find('[data-clip-count]').text()).toBe('2')
    expect(withClips.find('[data-clip-count]').attributes('title')).toBe('2 clips')
    expect(
      mount(FrameListItem, { props: { thumb: '/a.png', number: 3 } }).find('[data-clip-count]')
        .exists(),
    )
      .toBe(false)
  })
})
