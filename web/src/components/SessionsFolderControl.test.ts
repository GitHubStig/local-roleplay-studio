import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import * as api from '../api'
import SessionsFolderControl from './SessionsFolderControl.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  pickSessionsFolder: vi.fn(),
  checkSessionsFolder: vi.fn(),
  moveSessionsFolder: vi.fn(),
  forgetSessionsFolder: vi.fn(),
}))

const info = (extra: Partial<api.SessionsFolderInfo> = {}): api.SessionsFolderInfo => ({
  inUse: '/app/sessions',
  default: '/app/sessions',
  count: 3,
  folders: [
    { path: '/app/sessions', count: 3, default: true },
    { path: '/Volumes/Archive', count: 4, default: false },
    { path: '/Volumes/USB/Private', count: null, default: false },
  ],
  here: true,
  os: 'mac',
  ...extra,
})

beforeEach(() => vi.resetAllMocks())

function shown(start = info()) {
  const folder = ref<api.SessionsFolderInfo | null>(start)
  const wrapper = mount(SessionsFolderControl, {
    props: {
      info: folder.value,
      'onUpdate:info': (v: api.SessionsFolderInfo | null) => (folder.value = v),
    },
    attachTo: document.body,
  })
  return { wrapper, folder }
}

describe('SessionsFolderControl', () => {
  it('offers each folder with its Sessions, one not connected not to be picked', () => {
    const { wrapper } = shown()
    const options = wrapper.findAll('option')
    expect(options.map((o) => o.text())).toEqual([
      "/app/sessions (the app's own) · 3 Sessions",
      '/Volumes/Archive · 4 Sessions',
      '/Volumes/USB/Private · not connected',
    ])
    expect(options[2].attributes('disabled')).toBeDefined()
    expect(wrapper.find<HTMLSelectElement>('[data-sessions-folder]').element.value).toBe(
      '/app/sessions',
    )
  })

  it('switches to a folder picked from those offered, at once', async () => {
    vi.mocked(api.moveSessionsFolder).mockResolvedValue(
      info({ inUse: '/Volumes/Archive', count: 4 }),
    )
    const { wrapper, folder } = shown()
    await wrapper.find('[data-sessions-folder]').setValue('/Volumes/Archive')
    await flushPromises()
    expect(api.moveSessionsFolder).toHaveBeenCalledWith('/Volumes/Archive')
    expect(folder.value?.inUse).toBe('/Volumes/Archive')
    expect(wrapper.emitted('moved')).toHaveLength(1)
  })

  it("chooses another folder with the machine's dialog, used once confirmed", async () => {
    vi.mocked(api.pickSessionsFolder).mockResolvedValue({ path: '/Volumes/Big' })
    vi.mocked(api.checkSessionsFolder).mockResolvedValue({
      ok: true,
      path: '/Volumes/Big',
      count: 1,
      exists: true,
      same: false,
    })
    vi.mocked(api.moveSessionsFolder).mockResolvedValue(info({ inUse: '/Volumes/Big', count: 1 }))
    const { wrapper } = shown()
    await wrapper.find('[data-choose-folder]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-folder-chosen]').text()).toContain('It holds 1 Session.')
    expect(api.moveSessionsFolder).not.toHaveBeenCalled()
    await wrapper.find('[data-folder-apply]').trigger('click')
    await flushPromises()
    expect(api.moveSessionsFolder).toHaveBeenCalledWith('/Volumes/Big')
    expect(wrapper.find('[data-folder-chosen]').exists()).toBe(false)
  })

  it("away from the server's machine, the folder's path is typed instead", async () => {
    vi.mocked(api.checkSessionsFolder).mockResolvedValue({
      ok: true,
      path: '/Volumes/Big',
      count: 0,
      exists: false,
      same: false,
    })
    const { wrapper } = shown(info({ here: false }))
    await wrapper.find('[data-choose-folder]').trigger('click')
    await flushPromises()
    expect(api.pickSessionsFolder).not.toHaveBeenCalled()
    await wrapper.find('[data-folder-path]').setValue('/Volumes/Big')
    await wrapper.find('[data-folder-typed]').trigger('submit')
    await flushPromises()
    expect(api.checkSessionsFolder).toHaveBeenCalledWith('/Volumes/Big')
    expect(wrapper.find('[data-folder-chosen]').text()).toContain("doesn't exist yet")
  })

  it('says why a typed path is refused', async () => {
    vi.mocked(api.checkSessionsFolder).mockRejectedValue(
      new api.ApiError('Give a full path, like /Users/you/Sessions', 400),
    )
    const { wrapper } = shown(info({ here: false }))
    await wrapper.find('[data-choose-folder]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-folder-path]').setValue('Sessions')
    await wrapper.find('[data-folder-typed]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-folder-error]').text()).toContain('Give a full path')
  })

  it('forgets a folder used before, but offers neither the one in use nor the default', async () => {
    vi.mocked(api.forgetSessionsFolder).mockResolvedValue(
      info({ folders: info().folders.slice(0, 2) }),
    )
    const { wrapper, folder } = shown()
    await wrapper.find('[data-forget-folders]').trigger('click')
    const offered = wrapper.findAll('[data-forget-folder]')
    expect(offered.map((b) => b.text())).toEqual(['/Volumes/Archive', '/Volumes/USB/Private'])
    await offered[1].trigger('click')
    await flushPromises()
    expect(api.forgetSessionsFolder).toHaveBeenCalledWith('/Volumes/USB/Private')
    expect(folder.value?.folders).toHaveLength(2)
  })

  it('shows the folder in use again when a switch is refused', async () => {
    vi.mocked(api.moveSessionsFolder).mockRejectedValue(
      new api.ApiError('Wait for running and queued work to finish, or cancel it', 409),
    )
    const { wrapper } = shown()
    await wrapper.find('[data-sessions-folder]').setValue('/Volumes/Archive')
    await flushPromises()
    expect(wrapper.find('[data-folder-error]').text()).toContain('Wait for running')
    expect(wrapper.find<HTMLSelectElement>('[data-sessions-folder]').element.value).toBe(
      '/app/sessions',
    )
  })
})
