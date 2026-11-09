import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ask, asking, decline } from '../ask'
import ConfirmDialog from './ConfirmDialog.vue'

async function mountIt() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/other', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  const wrapper = mount(ConfirmDialog, { global: { plugins: [router] } })
  return { wrapper, router }
}

const isOpen = (wrapper: Awaited<ReturnType<typeof mountIt>>['wrapper']) =>
  (wrapper.find('dialog').element as HTMLDialogElement).open

afterEach(() => {
  if (asking.value) decline()
})

describe('ConfirmDialog', () => {
  it('asks in words, its button saying what it does, and answers yes on that button', async () => {
    const { wrapper } = await mountIt()
    const answer = ask('Delete it?', { action: 'Delete', danger: true })
    await flushPromises()
    expect(isOpen(wrapper)).toBe(true)
    expect(wrapper.find('[data-confirm-message]').text()).toBe('Delete it?')
    const action = wrapper.find('[data-confirm-action]')
    expect(action.text()).toBe('Delete')
    expect(action.classes()).toContain('bg-danger')
    await wrapper.find('form').trigger('submit')
    expect(await answer).toBe(true)
    await flushPromises()
    expect(isOpen(wrapper)).toBe(false)
  })

  it('answers no on Cancel, on the backdrop, and when the dialog is closed (Escape)', async () => {
    const { wrapper } = await mountIt()
    let answer = ask('Sure?', { action: 'Go' })
    await flushPromises()
    await wrapper.find('[data-confirm-cancel]').trigger('click')
    expect(await answer).toBe(false)

    answer = ask('Sure?', { action: 'Go' })
    await flushPromises()
    await wrapper.find('dialog').trigger('click')
    expect(await answer).toBe(false)

    answer = ask('Sure?', { action: 'Go' })
    await flushPromises()
    await wrapper.find('dialog').trigger('close')
    expect(await answer).toBe(false)
  })

  it('answers no on leaving the page, and to a question another replaces', async () => {
    const { wrapper, router } = await mountIt()
    const left = ask('Sure?', { action: 'Go' })
    await flushPromises()
    await router.push('/other')
    expect(await left).toBe(false)
    await flushPromises()
    expect(isOpen(wrapper)).toBe(false)

    const replaced = ask('First?', { action: 'Go' })
    const second = ask('Second?', { action: 'Go' })
    expect(await replaced).toBe(false)
    await flushPromises()
    expect(wrapper.find('[data-confirm-message]').text()).toBe('Second?')
    await wrapper.find('form').trigger('submit')
    expect(await second).toBe(true)
  })
})
