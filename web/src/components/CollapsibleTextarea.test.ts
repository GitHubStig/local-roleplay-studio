import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import CollapsibleTextarea from './CollapsibleTextarea.vue'

beforeEach(() => localStorage.clear())

// happy-dom doesn't lay text out: give each line of a textarea 20 px of scroll height.
Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
  configurable: true,
  get(this: HTMLTextAreaElement) {
    return this.value.split('\n').length * 20
  },
})

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
    const height = () => (box.element as HTMLTextAreaElement).style.height
    await nextTick()
    await nextTick()
    expect(height()).toBe('40px') // two lines
    await box.setValue('One\nTwo\nThree\nFour')
    await nextTick()
    await nextTick()
    expect(height()).toBe('80px')
    expect(wrapper.find('output').text()).toBe('One\nTwo\nThree\nFour')
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
