import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import CollapsibleTextarea from './CollapsibleTextarea.vue'

beforeEach(() => localStorage.clear())

const host = (initial = 'A tall woman\nof 34.') =>
  defineComponent(() => {
    const text = ref(initial)
    return () =>
      h('div', [
        h(CollapsibleTextarea, {
          id: 'look.character',
          label: 'Mira',
          modelValue: text.value,
          'onUpdate:modelValue': (v: string) => (text.value = v),
        }),
        h('output', text.value),
      ])
  })

describe('CollapsibleTextarea', () => {
  it('edits its text, and grows to fit it instead of scrolling', async () => {
    const wrapper = mount(host())
    const box = wrapper.find('textarea')
    expect((box.element as HTMLTextAreaElement).style.overflowY).toBe('hidden')
    expect((box.element as HTMLTextAreaElement).style.height).toMatch(/px$/)
    await box.setValue('A short woman.')
    expect(wrapper.find('output').text()).toBe('A short woman.')
  })

  it('collapses to a one-line preview by its label, remembered per browser', async () => {
    const wrapper = mount(host())
    const details = wrapper.find('details')
    expect((details.element as HTMLDetailsElement).open).toBe(true)
    ;(details.element as HTMLDetailsElement).open = false
    await details.trigger('toggle')
    expect(wrapper.find('[data-preview]').text()).toBe('· A tall woman of 34.')
    expect(localStorage.getItem('collapsed:look.character')).toBe('1')

    const again = mount(host())
    expect((again.find('details').element as HTMLDetailsElement).open).toBe(false)
  })
})
