import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '../api'
import { ask } from '../ask'
import { setCurrentSession, useCurrentSession } from '../composables/useCurrentSession'
import SessionPane from './SessionPane.vue'
import { exportSession } from '../sessionExport'

vi.mock('../ask', () => ({ ask: vi.fn() }))
vi.mock('../sessionExport', () => ({ exportSession: vi.fn(), canPickFile: () => true }))
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSessionContents: vi.fn(),
  openSessionFolder: vi.fn(),
  deleteSession: vi.fn(),
  renameSession: vi.fn(),
  listSessions: vi.fn(() => Promise.resolve([])),
  getKeepOptions: vi.fn(),
  previewKeep: vi.fn(),
  removeLeftOut: vi.fn(),
  getSettingsOptions: vi.fn(() => Promise.resolve({ imageModels: {}, videoModels: [] })),
}))

const session = (extra: Partial<api.SessionSummary> = {}): api.SessionSummary => ({
  id: 'a',
  kind: 'roleplay',
  scenarioId: 'tavern',
  title: 'The Rain-Soaked Tavern',
  frames: 3,
  thumbnail: 'frame-2-abcdef12.png',
  excerpt: null,
  createdAt: '2026-10-11T08:31:26.000Z',
  updatedAt: new Date().toISOString(),
  activity: null,
  ...extra,
})

const contents: api.SessionContents = {
  size: 2_200_000_000,
  parts: {
    pictures: 1_400_000_000,
    clips: 520_000_000,
    '3d': 180_000_000,
    sound: 94_000_000,
    calls: 0,
  },
  rest: 6_000_000,
  counts: {
    frames: 3,
    pictures: 4,
    imageModels: 2,
    edits: 1,
    clips: 2,
    speech: 5,
    threeD: 1,
    cues: 2,
    calls: 0,
  },
}

const options: api.KeepOptions = {
  imageModel: 'qwen',
  imageModels: [
    { model: 'qwen', count: 3, size: 900_000_000, pictures: 300_000_000 },
    { model: 'krea', count: 1, size: 500_000_000, pictures: 100_000_000 },
  ],
  upscales: { count: 1, size: 50_000_000 },
  edits: { count: 1, size: 20_000_000 },
  chosen: { count: 3, size: 800_000_000 },
  clips: [{ model: 'ltx', kinds: [{ kind: 'lead-in', count: 2, size: 520_000_000 }] }],
  threeD: [{ kind: 'scene', count: 1, size: 180_000_000 }],
  sound: [{ kind: 'speech', count: 5, size: 4_000_000 }, {
    kind: 'voices',
    count: 1,
    size: 1_000_000,
  }],
  calls: { count: 0, size: 0 },
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  vi.mocked(api.getSettingsOptions).mockResolvedValue(
    { imageModels: {}, videoModels: [] } as unknown as api.SettingsOptions,
  )
  vi.mocked(api.getKeepOptions).mockResolvedValue(options)
  vi.mocked(api.previewKeep).mockResolvedValue({
    kept: 1_700_000_000,
    leftOut: 500_000_000,
    after: options,
  })
  vi.mocked(api.getSessionContents).mockResolvedValue(contents)
  vi.mocked(api.deleteSession).mockResolvedValue()
  vi.mocked(ask).mockResolvedValue(true)
})

async function shown(
  props: Partial<{ session: api.SessionSummary; here: boolean; os: api.ServerOs }> = {},
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: {} }, { path: '/roleplay/:id', component: {} }],
  })
  const wrapper = mount(SessionPane, {
    props: { session: session(), here: true, os: 'mac', ...props },
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

describe('SessionPane', () => {
  it('plays the Session from its picture', async () => {
    const wrapper = await shown()
    const play = wrapper.find('[data-session-play]')
    expect(play.attributes('href')).toBe('/roleplay/a')
    expect(play.find('img').attributes('src')).toContain('frame-2-abcdef12.png')
  })

  it('shows its size split by part, the parts with nothing left out, and its counts', async () => {
    const wrapper = await shown()
    expect(wrapper.find('[data-session-size] strong').text()).toBe('2.2 GB on disk')
    expect(wrapper.findAll('[data-part]').map((p) => p.text())).toEqual([
      'Pictures 1.4 GB',
      'Clips 520 MB',
      '3D 180 MB',
      'Sound 94 MB',
      'Text and caches 6 MB',
    ])
    expect(wrapper.find('[data-session-counts]').text()).toContain('Pictures · 2 Image Models')
    expect(wrapper.find('[data-session-counts]').text()).toContain('Speech and thoughts')
  })

  it("leaves out a Roleplay's counts for a Chain", async () => {
    const wrapper = await shown({ session: session({ kind: 'chain' }) })
    expect(wrapper.find('[data-session-counts]').text()).not.toContain('Speech')
    expect(wrapper.find('[data-session-counts]').text()).not.toContain('Music')
  })

  it("names the folder button for the machine's file manager, and shows it only on that machine", async () => {
    expect((await shown()).find('[data-open-folder]').attributes('aria-label')).toBe(
      'Open in Finder',
    )
    expect((await shown({ os: 'windows' })).find('[data-open-folder]').attributes('aria-label'))
      .toBe('Open in Explorer')
    expect((await shown({ os: 'other' })).find('[data-open-folder]').attributes('aria-label')).toBe(
      'Open folder',
    )
    expect((await shown({ here: false })).find('[data-open-folder]').exists()).toBe(false)
    const wrapper = await shown()
    await wrapper.find('[data-open-folder]').trigger('click')
    expect(api.openSessionFolder).toHaveBeenCalledWith('a')
  })

  it('renames the Session from its title', async () => {
    vi.mocked(api.renameSession).mockResolvedValue({ title: 'Last orders' })
    const wrapper = await shown()
    await wrapper.find('[data-session-rename]').trigger('click')
    await wrapper.find('[data-session-title-field]').setValue('Last orders')
    await wrapper.find('[data-session-title-field]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(api.renameSession).toHaveBeenCalledWith('a', 'Last orders')
    expect(wrapper.find('[data-session-title]').text()).toBe('Last orders')
  })

  it('deletes the Session once confirmed, forgetting it as current and its draft', async () => {
    setCurrentSession('a', 'roleplay')
    localStorage.setItem('draft:a', 'half typed')
    const wrapper = await shown()
    await wrapper.find('[data-delete]').trigger('click')
    await flushPromises()
    expect(vi.mocked(ask).mock.calls[0][1]).toEqual({ action: 'Delete', danger: true })
    expect(api.deleteSession).toHaveBeenCalledWith('a')
    expect(useCurrentSession().currentSessionId.value).toBeNull()
    expect(localStorage.getItem('draft:a')).toBeNull()
    expect(wrapper.emitted('deleted')).toHaveLength(1)
  })

  it('deletes nothing when not confirmed, nor while work runs', async () => {
    vi.mocked(ask).mockResolvedValue(false)
    const wrapper = await shown()
    await wrapper.find('[data-delete]').trigger('click')
    await flushPromises()
    expect(api.deleteSession).not.toHaveBeenCalled()
    const busy = await shown({ session: session({ activity: 'image' }) })
    expect(busy.find('[data-delete]').attributes('disabled')).toBeDefined()
  })

  it('exports the Session under its name, saying how far it has got, and stops on Cancel', async () => {
    let written!: (n: number) => void
    let finish!: (end: 'saved' | 'cancelled') => void
    vi.mocked(exportSession).mockImplementation((_id, _name, onWritten, signal) => {
      written = onWritten
      return new Promise((r) => {
        finish = r
        signal.addEventListener('abort', () => r('cancelled'))
      })
    })
    const wrapper = await shown()
    await wrapper.find('[data-export-start]').trigger('click')
    // Every tick on: all of it.
    expect(vi.mocked(exportSession).mock.calls[0]).toEqual([
      'a',
      'the-rain-soaked-tavern-a.zip',
      expect.any(Function),
      expect.any(AbortSignal),
      undefined,
    ])
    written(1_100_000_000)
    await flushPromises()
    expect(wrapper.find('[data-exporting]').text()).toContain('1.1 GB of about 2.2 GB')
    expect(wrapper.find('[data-delete]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-export-cancel]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-exporting]').exists()).toBe(false)
    expect(wrapper.find('[data-export]').text()).not.toContain('Saved')

    await wrapper.find('[data-export-start]').trigger('click')
    finish('saved')
    await flushPromises()
    expect(wrapper.find('[data-export]').text()).toContain('Saved.')
  })

  it("won't export while work runs, and says why it failed", async () => {
    const busy = await shown({ session: session({ activity: 'image' }) })
    expect(busy.find('[data-export-start]').attributes('disabled')).toBeDefined()
    vi.mocked(exportSession).mockRejectedValue(new Error('Work is running'))
    const wrapper = await shown()
    await wrapper.find('[data-export-start]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain("Couldn't export it: Work is running")
  })

  /** Lets the ticks' preview, asked once they settle, come back. */
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 250))
    await flushPromises()
  }

  it('leaves out what is unticked, saying what that keeps, and exports only what is ticked', async () => {
    const wrapper = await shown()
    expect(wrapper.find('[data-keeping]').text()).toContain('All of it, 2.2 GB')
    expect(wrapper.find('[data-remove-rest]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-keep-model="krea"]').setValue(false)
    await settle()
    const left = { ...api.KEEP_ALL, imageModels: ['krea'] }
    expect(vi.mocked(api.previewKeep).mock.calls[0].slice(0, 2)).toEqual(['a', left])
    expect(wrapper.find('[data-keeping]').text()).toBe('Keeping about 1.7 GB · leaving out 500 MB')
    expect(wrapper.find('[data-export-start]').text()).toBe('Export ticked')
    vi.mocked(exportSession).mockResolvedValue('saved')
    await wrapper.find('[data-export-start]').trigger('click')
    expect(vi.mocked(exportSession).mock.calls[0][4]).toEqual(left)
  })

  it('shows every row of What to keep folded, each with a caret that says it opens', async () => {
    const wrapper = await shown()
    const rows = wrapper.findAll('[data-keep-row]')
    expect(rows.map((r) => r.attributes('data-keep-row'))).toEqual([
      'pictures',
      'clips',
      '3d',
      'sound',
    ])
    for (const row of rows) {
      expect(row.element.tagName).toBe('DETAILS')
      expect(row.find('summary [data-keep-caret]').exists()).toBe(true)
    }
  })

  it("Chosen picture only greys out the Image Models' ticks; leaving out voices warns", async () => {
    const wrapper = await shown()
    await wrapper.find('[data-keep-chosen]').setValue(true)
    expect(wrapper.find('[data-keep-model="krea"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-keep-voice-warning]').exists()).toBe(false)
    await wrapper.find('[data-keep-sound="voices"]').setValue(false)
    expect(wrapper.find('[data-keep-voice-warning]').text()).toContain("can't speak")
  })

  it('greys out what has nothing left once the pictures have taken theirs', async () => {
    vi.mocked(api.previewKeep).mockResolvedValue({
      kept: 1,
      leftOut: 1,
      after: {
        ...options,
        clips: [{ model: 'ltx', kinds: [{ kind: 'lead-in', count: 0, size: 0 }] }],
        threeD: [],
      },
    })
    const wrapper = await shown()
    await wrapper.find('[data-keep-model="qwen"]').setValue(false)
    await settle()
    expect(wrapper.find('[data-keep-clip="ltx lead-in"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-keep-3d="scene"]').attributes('disabled')).toBeDefined()
  })

  it('removes the rest once confirmed, naming it and its size, then shows the Session as it is', async () => {
    vi.mocked(api.removeLeftOut).mockResolvedValue({
      session: {} as api.Session,
      freed: 500_000_000,
    })
    const wrapper = await shown()
    await wrapper.find('[data-keep-model="krea"]').setValue(false)
    await wrapper.find('[data-keep-sound="speech"]').setValue(false)
    await settle()
    await wrapper.find('[data-remove-rest]').trigger('click')
    await flushPromises()
    const [question, how] = vi.mocked(ask).mock.calls[0]
    expect(question).toContain(
      'the pictures by krea; the speech and thoughts from this Session (500 MB)',
    )
    expect(how).toEqual({ action: 'Remove', danger: true })
    expect(api.removeLeftOut).toHaveBeenCalledWith('a', {
      ...api.KEEP_ALL,
      imageModels: ['krea'],
      sound: ['speech'],
    })
    expect(api.getSessionContents).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('changed')).toHaveLength(1)
    expect(wrapper.find('[data-keep-model="krea"]').element).toHaveProperty('checked', true)
  })

  it('removes nothing when not confirmed', async () => {
    vi.mocked(ask).mockResolvedValue(false)
    const wrapper = await shown()
    await wrapper.find('[data-keep-calls]').exists()
    await wrapper.find('[data-keep-model="krea"]').setValue(false)
    await settle()
    await wrapper.find('[data-remove-rest]').trigger('click')
    await flushPromises()
    expect(api.removeLeftOut).not.toHaveBeenCalled()
  })
})
