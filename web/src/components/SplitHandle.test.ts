import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import SplitHandle from './SplitHandle.vue'

/** The handle inside a 1000 px wide box, sizing the pane on its right. */
function mountIt(start: number) {
  const width = ref(start)
  const wrapper = mount(
    defineComponent(() => () =>
      h('div', [
        h(SplitHandle, {
          modelValue: width.value,
          'onUpdate:modelValue': (px: number) => (width.value = px),
          min: 300,
          leave: 400,
          label: 'Resize',
        }),
      ])
    ),
    { attachTo: document.body },
  )
  const box = wrapper.element as HTMLElement
  box.getBoundingClientRect = () => ({ left: 0, right: 1000, width: 1000 }) as DOMRect
  return { wrapper, width: () => width.value }
}

describe('SplitHandle', () => {
  it('moves with the arrow keys, kept between its least and what leaves the other pane room', async () => {
    const { wrapper, width } = mountIt(500)
    const handle = wrapper.find('[data-split-handle]')
    await handle.trigger('keydown', { key: 'ArrowLeft' })
    expect(width()).toBe(532)
    for (let i = 0; i < 10; i++) await handle.trigger('keydown', { key: 'ArrowLeft' })
    expect(width()).toBe(600)
    for (let i = 0; i < 20; i++) await handle.trigger('keydown', { key: 'ArrowRight' })
    expect(width()).toBe(300)
    expect(handle.attributes('aria-valuenow')).toBe('300')
    wrapper.unmount()
  })
})
