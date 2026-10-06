import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ComposeBox from './ComposeBox.vue'

describe('ComposeBox', () => {
  it('is three lines, sends on Enter, and starts a new line on Shift+Enter', async () => {
    const wrapper = mount(ComposeBox, { props: { modelValue: 'Sit down', placeholder: 'What…' } })
    const box = wrapper.find('textarea')
    expect(box.attributes('rows')).toBe('3')
    await box.trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(wrapper.emitted('send')).toBeUndefined()
    await box.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('send')).toHaveLength(1)
  })
})
