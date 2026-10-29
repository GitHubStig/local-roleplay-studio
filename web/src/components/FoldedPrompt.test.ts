import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import FoldedPrompt from './FoldedPrompt.vue'

afterEach(() => localStorage.clear())

const mountIt = () =>
  mount(FoldedPrompt, {
    props: { preview: 'A tavern at night, rain on the window.' },
    slots: {
      default: '<p data-body>The whole prompt</p>',
      actions: '<button data-act>Again</button>',
    },
  })

describe('FoldedPrompt', () => {
  it('folds to a line with a preview, remembered for every screen', async () => {
    const wrapper = mountIt()
    expect(wrapper.find('[data-body]').exists()).toBe(true)
    expect(wrapper.find('[data-preview]').exists()).toBe(false)
    await wrapper.find('[data-toggle-image-prompt]').trigger('click')
    expect(wrapper.find('[data-body]').exists()).toBe(false)
    expect(wrapper.find('[data-preview]').text()).toBe('· A tavern at night, rain on the window.')
    // Its actions stay while it's folded.
    expect(wrapper.find('[data-act]').exists()).toBe(true)
    // Another screen's opens folded.
    expect(mountIt().find('[data-body]').exists()).toBe(false)
  })
})
