import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import LookPerson from './LookPerson.vue'

beforeEach(() => localStorage.clear())

const host = () =>
  defineComponent(() => {
    const person = ref({ name: 'Rin', identity: 'Rin, a tall\nstudent.' })
    const removed = ref(0)
    return () =>
      h('div', [
        h(LookPerson, {
          id: 'storyboard.look.person.0',
          name: person.value.name,
          identity: person.value.identity,
          'onUpdate:name': (v: string) => (person.value.name = v),
          'onUpdate:identity': (v: string) => (person.value.identity = v),
          onRemove: () => removed.value++,
        }),
        h('output', `${person.value.name}|${person.value.identity}|${removed.value}`),
      ])
  })

describe('LookPerson', () => {
  it('edits the name and identity, headed by the name', async () => {
    const wrapper = mount(host())
    await wrapper.find('[data-person-name]').setValue('Kai')
    await wrapper.find('textarea').setValue('Kai, a short student.')
    expect(wrapper.find('summary').text()).toContain('Kai')
    expect(wrapper.find('output').text()).toBe('Kai|Kai, a short student.|0')
    await wrapper.find('[aria-label="Remove Kai"]').trigger('click')
    expect(wrapper.find('output').text()).toBe('Kai|Kai, a short student.|1')
  })

  it('collapses the whole card to the name and a preview, remembered per browser', async () => {
    const wrapper = mount(host())
    const details = wrapper.find('details')
    expect((details.element as HTMLDetailsElement).open).toBe(true)
    ;(details.element as HTMLDetailsElement).open = false
    await details.trigger('toggle')
    expect(wrapper.find('[data-preview]').text()).toBe('· Rin, a tall student.')
    expect(localStorage.getItem('collapsed:storyboard.look.person.0')).toBe('1')

    const again = mount(host())
    expect((again.find('details').element as HTMLDetailsElement).open).toBe(false)
  })
})
