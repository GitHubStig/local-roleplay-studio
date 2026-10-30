import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import SessionsFolderTab from './SessionsFolderTab.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSessionsFolder: vi.fn(),
  pickSessionsFolder: vi.fn(),
  checkSessionsFolder: vi.fn(),
  moveSessionsFolder: vi.fn(),
}))

const own = { inUse: '/app/sessions', default: '/app/sessions', count: 3 }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.getSessionsFolder).mockResolvedValue(own)
})

async function shown() {
  const wrapper = mount(SessionsFolderTab)
  await flushPromises()
  return wrapper
}

describe('SessionsFolderTab', () => {
  it('shows the folder in use, read-only, with how many Sessions are in it', async () => {
    const wrapper = await shown()
    const input = wrapper.find<HTMLInputElement>('[data-sessions-folder]')
    expect([input.element.value, input.attributes('readonly')]).toEqual(['/app/sessions', ''])
    expect(wrapper.find('[data-sessions-in-use]').text()).toContain('3 Sessions here')
    expect(wrapper.find('[data-use-default]').exists()).toBe(false)
  })

  it('counts the Sessions in a folder chosen, and moves only once confirmed', async () => {
    vi.mocked(api.pickSessionsFolder).mockResolvedValue({ path: '/Volumes/Big/Sessions' })
    vi.mocked(api.checkSessionsFolder).mockResolvedValue({
      path: '/Volumes/Big/Sessions',
      count: 1,
      exists: true,
      same: false,
    })
    vi.mocked(api.moveSessionsFolder).mockResolvedValue({
      inUse: '/Volumes/Big/Sessions',
      default: '/app/sessions',
      count: 1,
    })
    const wrapper = await shown()
    await wrapper.find('[data-choose-folder]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-folder-chosen]').text()).toContain('It holds 1 Session.')
    expect(api.moveSessionsFolder).not.toHaveBeenCalled()
    expect(wrapper.find<HTMLInputElement>('[data-sessions-folder]').element.value)
      .toBe('/app/sessions')

    await wrapper.find('[data-folder-apply]').trigger('click')
    await flushPromises()
    expect(api.moveSessionsFolder).toHaveBeenCalledWith('/Volumes/Big/Sessions')
    expect(wrapper.find<HTMLInputElement>('[data-sessions-folder]').element.value)
      .toBe('/Volumes/Big/Sessions')
    expect(wrapper.find('[data-folder-chosen]').exists()).toBe(false)
    expect(wrapper.find('[data-folder-moved]').exists()).toBe(true)
    expect(wrapper.find('[data-use-default]').exists()).toBe(true)
  })

  it('leaves the folder alone when cancelled or when the dialog is', async () => {
    vi.mocked(api.pickSessionsFolder).mockResolvedValueOnce({ path: null })
    const wrapper = await shown()
    await wrapper.find('[data-choose-folder]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-folder-chosen]').exists()).toBe(false)

    vi.mocked(api.pickSessionsFolder).mockResolvedValueOnce({ path: '/x' })
    vi.mocked(api.checkSessionsFolder).mockResolvedValue({
      path: '/x',
      count: 0,
      exists: false,
      same: false,
    })
    await wrapper.find('[data-choose-folder]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-folder-chosen]').text()).toContain('will be made')
    await wrapper.find('[data-folder-cancel]').trigger('click')
    expect(wrapper.find('[data-folder-chosen]').exists()).toBe(false)
    expect(api.moveSessionsFolder).not.toHaveBeenCalled()
  })

  it('does nothing for the folder in use, and drops a pending choice when it is picked again', async () => {
    vi.mocked(api.pickSessionsFolder).mockResolvedValueOnce({ path: '/other' })
    vi.mocked(api.checkSessionsFolder).mockResolvedValueOnce({
      path: '/other',
      count: 0,
      exists: true,
      same: false,
    })
    const wrapper = await shown()
    await wrapper.find('[data-choose-folder]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-folder-chosen]').exists()).toBe(true)

    vi.mocked(api.pickSessionsFolder).mockResolvedValueOnce({ path: '/app/sessions' })
    vi.mocked(api.checkSessionsFolder).mockResolvedValueOnce({
      path: '/app/sessions',
      count: 3,
      exists: true,
      same: true,
    })
    await wrapper.find('[data-choose-folder]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-folder-chosen]').exists()).toBe(false)
    expect(wrapper.find('[data-folder-error]').exists()).toBe(false)
    expect(api.moveSessionsFolder).not.toHaveBeenCalled()
  })

  it('says why a folder was refused', async () => {
    vi.mocked(api.pickSessionsFolder).mockResolvedValue({ path: '/file' })
    vi.mocked(api.checkSessionsFolder).mockRejectedValue(new Error('/file is a file'))
    const wrapper = await shown()
    await wrapper.find('[data-choose-folder]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-folder-error]').text()).toBe('/file is a file')
  })
})
