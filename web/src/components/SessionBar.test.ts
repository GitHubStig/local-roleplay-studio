import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { useSessionList } from '../composables/useSessionList'
import SessionBar from './SessionBar.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  renameSession: vi.fn(),
}))

/** The bar for Session s1, its title bound as a screen binds it. */
function bar(title = 'The Tavern') {
  const wrapper = mount(SessionBar, {
    props: {
      id: 's1',
      kind: 'Chain',
      title,
      'onUpdate:title': (t: string) => wrapper.setProps({ title: t }),
    },
  })
  return wrapper
}

describe('SessionBar', () => {
  beforeEach(() => {
    vi.mocked(api.renameSession).mockReset()
    useSessionList().sessions.value = [{ id: 's1', title: 'The Tavern' } as api.SessionSummary]
  })

  it('renames the Session when its title is clicked, typed and Entered', async () => {
    vi.mocked(api.renameSession).mockResolvedValue({ title: 'The Tavern, later' })
    const wrapper = bar()
    await wrapper.find('[data-session-rename]').trigger('click')
    const field = wrapper.find('[data-session-title-field]')
    expect((field.element as HTMLInputElement).value).toBe('The Tavern')
    await field.setValue('  The Tavern, later ')
    await field.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(api.renameSession).toHaveBeenCalledWith('s1', 'The Tavern, later')
    expect(wrapper.find('[data-session-title]').text()).toBe('The Tavern, later')
    // Wherever it's listed, too (the rail's Current Session).
    expect(useSessionList().sessions.value?.[0].title).toBe('The Tavern, later')
  })

  it('keeps the title on Escape, or when left blank or unchanged', async () => {
    const wrapper = bar()
    for (
      const [typed, key] of [['Elsewhere', 'Escape'], ['  ', 'Enter'], ['The Tavern', 'Enter']]
    ) {
      await wrapper.find('[data-session-rename]').trigger('click')
      const field = wrapper.find('[data-session-title-field]')
      await field.setValue(typed)
      await field.trigger('keydown', { key })
      await flushPromises()
      expect(wrapper.find('[data-session-title]').text()).toBe('The Tavern')
    }
    expect(api.renameSession).not.toHaveBeenCalled()
  })

  it('saves when the field loses focus', async () => {
    vi.mocked(api.renameSession).mockResolvedValue({ title: 'Upstairs' })
    const wrapper = bar()
    await wrapper.find('[data-session-rename]').trigger('click')
    const field = wrapper.find('[data-session-title-field]')
    await field.setValue('Upstairs')
    await field.trigger('blur')
    await flushPromises()
    expect(wrapper.find('[data-session-title]').text()).toBe('Upstairs')
  })

  it('puts the title back and says why when the rename fails', async () => {
    vi.mocked(api.renameSession).mockRejectedValue(new Error('title must be some text'))
    const wrapper = bar()
    await wrapper.find('[data-session-rename]').trigger('click')
    const field = wrapper.find('[data-session-title-field]')
    await field.setValue('Upstairs')
    await field.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(wrapper.find('[data-session-title]').text()).toBe('The Tavern')
    expect(wrapper.find('[role="alert"]').text()).toContain('title must be some text')
  })
})
