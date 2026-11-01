import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NotifyWhenDone from './NotifyWhenDone.vue'

/** A stand-in for the browser's Notification, answering `answer` when asked for permission. */
function stubNotification(answer: NotificationPermission) {
  const stub = class {
    static permission: NotificationPermission = 'default'
    static requestPermission = vi.fn(() => Promise.resolve(stub.permission = answer))
    close() {}
  }
  vi.stubGlobal('Notification', stub)
  return stub
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('NotifyWhenDone', () => {
  it('asks for permission as it turns on, and remembers it', async () => {
    const stub = stubNotification('granted')
    const wrapper = mount(NotifyWhenDone)
    await wrapper.find('input').setValue(true)
    await flushPromises()
    expect(stub.requestPermission).toHaveBeenCalledOnce()
    expect(localStorage.getItem('notify-when-done')).toBe('1')
    expect((wrapper.find('input').element as HTMLInputElement).checked).toBe(true)
  })

  it('stays off, and says why, when the browser refuses', async () => {
    stubNotification('denied')
    const wrapper = mount(NotifyWhenDone)
    await wrapper.find('input').setValue(true)
    await flushPromises()
    expect(localStorage.getItem('notify-when-done')).toBeNull()
    expect((wrapper.find('input').element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.find('[data-notify-blocked]').exists()).toBe(true)
  })
})
