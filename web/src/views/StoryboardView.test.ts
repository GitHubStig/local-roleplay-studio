import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '../api'
import { useCurrentSession } from '../composables/useCurrentSession'
import { promptFor } from '../testing'
import StoryboardView from './StoryboardView.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSession: vi.fn(),
  planStoryboard: vi.fn(),
  writeStoryboard: vi.fn(),
  restartStoryboard: vi.fn(),
  editStoryboardFrame: vi.fn(),
  saveFrameBody: vi.fn(),
  saveBeat: vi.fn(),
  insertBeat: vi.fn(),
  removeBeat: vi.fn(),
  saveLook: vi.fn(),
  cancelFrame: vi.fn(),
  listJobs: vi.fn(),
  queueJob: vi.fn(),
  chainFromStoryboard: vi.fn(),
}))

/** A queued job, as the server lists it. */
const job = (kind: api.JobKind, frameIndex: number, extra: Partial<api.Job> = {}): api.Job => ({
  id: `${kind}-${frameIndex}`,
  kind,
  frameIndex,
  status: 'queued',
  createdAt: '2026-09-25T00:00:00.000Z',
  ...extra,
})

const look: api.Look = {
  subjects: [
    { name: 'Rin', identity: 'Rin, a tall student.' },
    { name: 'Kai', identity: 'Kai, a short student.' },
  ],
  style: 'Manga ink.',
}

/** A picture by the Storyboard's Image Model. */
const picture = (image: string, extra: Partial<api.Picture> = {}): api.Picture => ({
  image,
  imageModel: 'qwen-image-2.1',
  ...extra,
})

const frame = (index: number, extra: Partial<api.StoryboardFrame> = {}): api.StoryboardFrame => ({
  index,
  beat: `Beat ${index + 1}.`,
  body: `Body ${index + 1}.`,
  shown: ['Rin'],
  prompt: promptFor(index),
  pictures: [],
  createdAt: '2026-09-25T00:00:00.000Z',
  ...extra,
})

/** A Frame of the plan, its sentences not written yet. */
const planned = (index: number, extra: Partial<api.StoryboardFrame> = {}) =>
  frame(index, { body: '', prompt: '', ...extra })

const storyboard = (frames: api.StoryboardFrame[] = []): api.StoryboardSession => ({
  id: 'sb',
  kind: 'storyboard',
  brief: 'A first dunk.',
  scenarioId: null,
  settings: { imageModel: 'qwen-image-2.1' } as api.Settings,
  seed: 1,
  createdAt: '2026-09-25T00:00:00.000Z',
  frameCount: 3,
  look: frames.length ? look : null,
  frames,
})

async function mountIt() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: {} },
      { path: '/sessions/:id', component: {} },
      { path: '/storyboards/:id', component: {} },
    ],
  })
  await router.push('/storyboards/sb')
  const wrapper = mount(StoryboardView, { props: { id: 'sb' }, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof mountIt>>['wrapper']
const buttonNamed = (wrapper: Wrapper, name: string) =>
  wrapper.findAll('button').find((b) => b.text().startsWith(name))!

/** A stream held open: `emit` sends events, `finish` ends it. */
function held() {
  let emit!: (e: api.StoryboardEvent) => void
  let finish!: () => void
  const call = (onEvent: (e: api.StoryboardEvent) => void) =>
    new Promise<void>((resolve) => {
      emit = onEvent
      finish = resolve
    })
  return { call, emit: (e: api.StoryboardEvent) => emit(e), finish: () => finish() }
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal(
    'Image',
    class {
      set src(_: string) {}
    },
  )
  for (const fn of [api.planStoryboard, api.writeStoryboard, api.editStoryboardFrame]) {
    vi.mocked(fn).mockReset()
  }
  vi.mocked(api.listJobs).mockReset().mockResolvedValue([])
  // Queued jobs accumulate, as the server's queue does.
  const queued: api.Job[] = []
  vi.mocked(api.queueJob).mockReset().mockImplementation(async (_id, kind, index) => {
    queued.push(job(kind, index))
    return [...queued]
  })
  vi.mocked(api.getSession).mockResolvedValue(storyboard([frame(0), frame(1), frame(2)]))
})

afterEach(() => vi.unstubAllGlobals())
enableAutoUnmount(afterEach)

describe('StoryboardView', () => {
  it('plans a new Storyboard, listing its Beats as they arrive, for review', async () => {
    vi.mocked(api.getSession).mockResolvedValue(storyboard())
    const stream = held()
    vi.mocked(api.planStoryboard).mockImplementation((_id, onEvent) => stream.call(onEvent))
    const { wrapper } = await mountIt()

    expect(wrapper.find('[role=status]').text()).toBe('Planning the Storyboard…')
    stream.emit({ type: 'look', look })
    stream.emit({ type: 'planned-beat', index: 0, beat: 'Beat 1.', shown: ['Rin'] })
    await flushPromises()
    expect(wrapper.findAll('[data-frame]')).toHaveLength(1)
    expect(wrapper.findAll('[data-frame]')[0].text()).toContain('Planning…')
    expect(wrapper.find('[role=status]').text()).toBe('Planning Beat 2 of 3…')

    stream.emit({ type: 'planned', session: storyboard([planned(0), planned(1), planned(2)]) })
    stream.finish()
    await flushPromises()
    expect(wrapper.find('[role=status]').exists()).toBe(false)
    expect(wrapper.findAll('[data-status]').map((s) => s.text())).toEqual([
      'Not written',
      'Not written',
      'Not written',
    ])
    expect(wrapper.find('[data-write]').text()).toBe('Write 3 Frames')
    expect(wrapper.find('[data-review]').exists()).toBe(true)
    expect(useCurrentSession().currentSessionKind.value).toBe('storyboard')
  })

  it('starts the listed plan over when a retry sends a new Look', async () => {
    vi.mocked(api.getSession).mockResolvedValue(storyboard())
    const stream = held()
    vi.mocked(api.planStoryboard).mockImplementation((_id, onEvent) => stream.call(onEvent))
    const { wrapper } = await mountIt()
    stream.emit({ type: 'look', look })
    stream.emit({ type: 'planned-beat', index: 0, beat: 'Old 1.', shown: [] })
    stream.emit({ type: 'look', look })
    await flushPromises()
    expect(wrapper.findAll('[data-frame]')).toHaveLength(0)
    stream.emit({ type: 'planned-beat', index: 0, beat: 'New 1.', shown: [] })
    stream.emit({ type: 'planned-beat', index: 1, beat: 'New 2.', shown: [] })
    await flushPromises()
    expect(wrapper.findAll('[data-frame]').map((f) => f.text())).toEqual([
      '1New 1.Planning…',
      '2New 2.Planning…',
    ])
  })

  it('writes the Frames from the reviewed plan, showing each as it comes, then fixes the plan', async () => {
    vi.mocked(api.getSession).mockResolvedValue(storyboard([planned(0), planned(1), planned(2)]))
    const stream = held()
    vi.mocked(api.writeStoryboard).mockImplementation((_id, onEvent) => stream.call(onEvent))
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-field="storyboard.frame"]').element).toHaveProperty(
      'value',
      'Beat 1.',
    )
    expect(wrapper.find('[data-look] textarea').attributes('disabled')).toBeUndefined()

    const shownFrame = () => wrapper.find('[data-frame][aria-current="true"]').text()
    const sweeping = () =>
      wrapper.findAll('[data-frame]').map((f) => f.find('[data-writing-frame]').exists())
    await wrapper.find('[data-write]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role=status]').text()).toBe('Writing Frame 1 of 3…')
    expect(sweeping()).toEqual([true, false, false])
    expect(wrapper.find('[data-write-progress]').text()).toBe('0 of 3 written')
    stream.emit({ type: 'written-frame', frame: frame(0) })
    await flushPromises()
    expect(wrapper.find('[role=status]').text()).toBe('Writing Frame 2 of 3…')
    expect(wrapper.findAll('[data-status]').map((s) => s.text())).toEqual([
      'Draft',
      'Writing…',
      'Waiting',
    ])
    // The Frame shown follows the writing, its picture and sentences sweeping, as the list's does.
    expect(sweeping()).toEqual([false, true, false])
    expect(shownFrame()).toContain('Beat 2.')
    expect(wrapper.find('main [data-rendering="image"]').exists()).toBe(true)
    expect(wrapper.find('[data-prompt-panel] [data-rewriting]').exists()).toBe(true)
    expect(wrapper.find('[data-write-progress]').text()).toBe('1 of 3 written')
    // Until another is picked: then it stays put.
    await wrapper.findAll('[data-frame]')[0].trigger('click')
    stream.emit({ type: 'written-frame', frame: frame(1) })
    await flushPromises()
    expect(shownFrame()).toContain('Beat 1.')
    // A render now would unload the Text Model while it writes.
    expect(wrapper.find('[data-render-button]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-render-all]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-render-button]').attributes('title')).toBe(
      'Wait for the writing to finish',
    )

    stream.emit({ type: 'written', session: storyboard([frame(0), frame(1), frame(2)]) })
    stream.finish()
    await flushPromises()
    expect(sweeping()).toEqual([false, false, false])
    expect(wrapper.find('[data-render-button]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-render-all]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-write]').exists()).toBe(false)
    expect(wrapper.find('[data-field="storyboard.frame"]').element).toHaveProperty(
      'value',
      'Body 1.',
    )
    expect(wrapper.find('[data-look] textarea').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-plan-fixed]').exists()).toBe(true)
  })

  it('offers to write the rest after a write that stopped part-way', async () => {
    vi.mocked(api.getSession).mockResolvedValue(storyboard([frame(0), planned(1), planned(2)]))
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-write]').text()).toBe('Write the rest (2)')
    // The plan is fixed once a Frame is written, Beats not yet written included.
    await wrapper.findAll('[data-frame]')[1].trigger('click')
    expect(wrapper.find('[data-field="storyboard.frame"]').attributes('disabled')).toBeDefined()
  })

  it('restarts back to the plan once confirmed', async () => {
    vi.mocked(api.restartStoryboard).mockResolvedValue(
      storyboard([planned(0), planned(1), planned(2)]),
    )
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirm)
    const { wrapper } = await mountIt()
    await wrapper.find('[data-restart]').trigger('click')
    expect(api.restartStoryboard).not.toHaveBeenCalled()
    vi.mocked(api.getSession).mockResolvedValue(storyboard([planned(0), planned(1), planned(2)]))
    await wrapper.find('[data-restart]').trigger('click')
    await flushPromises()
    expect(api.restartStoryboard).toHaveBeenCalledWith('sb')
    expect(wrapper.find('[data-write]').text()).toBe('Write 3 Frames')
  })

  it("doesn't plan again once planned", async () => {
    await mountIt()
    expect(api.planStoryboard).not.toHaveBeenCalled()
  })

  it('goes Home with the error when planning fails and the Session is discarded', async () => {
    vi.mocked(api.getSession).mockResolvedValue(storyboard())
    vi.mocked(api.planStoryboard).mockImplementation(async (_id, onEvent) =>
      onEvent({ type: 'failed', message: 'Ollama is down', sessionDiscarded: true })
    )
    const { router } = await mountIt()
    expect(router.currentRoute.value.fullPath).toBe('/?error=Ollama+is+down')
  })

  it('sends a Chain to its own screen', async () => {
    vi.mocked(api.getSession).mockResolvedValue({ ...storyboard(), kind: 'chain' } as never)
    const { router } = await mountIt()
    expect(router.currentRoute.value.path).toBe('/sessions/sb')
  })

  it('moves through the Frames with ↑ and ↓ in their list', async () => {
    const { wrapper } = await mountIt()
    const current = () =>
      wrapper.findAll('[data-frame]').findIndex((f) => f.attributes('aria-current') === 'true')
    const press = async (key: string) => {
      await wrapper.findAll('[data-frame]')[current()].trigger('keydown', { key })
      await flushPromises()
    }
    expect(current()).toBe(0)
    await press('ArrowDown')
    expect(current()).toBe(1)
    await press('ArrowUp')
    await press('ArrowUp')
    expect(current()).toBe(0)
  })

  it('queues a render of the selected Frame, and says so on it', async () => {
    const { wrapper } = await mountIt()
    await wrapper.findAll('[data-frame]')[1].trigger('click')
    await wrapper.find('[data-render-button]').trigger('click')
    await flushPromises()
    expect(api.queueJob).toHaveBeenCalledWith('sb', 'render', 1)
    await wrapper.find('[data-tab=queue]').trigger('click')
    expect(wrapper.find('[data-queue]').text()).toContain('Frame 2')
    expect(wrapper.findAll('[data-status]').map((s) => s.text())).toEqual([
      'Draft',
      'Render…',
      'Draft',
    ])
    // Queued once: the button is off until the job is done.
    expect(wrapper.find('[data-render-button]').attributes('disabled')).toBeDefined()
  })

  it('opens the shown picture in the viewer when clicked', async () => {
    // Pictures preload before they show; here they load at once.
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null
        set src(_: string) {
          queueMicrotask(() => this.onload?.())
        }
      },
    )
    vi.mocked(api.getSession).mockResolvedValue(
      storyboard([frame(0, { pictures: [picture('frame-0-aaaaaaaa.png')] }), frame(1)]),
    )
    const { wrapper } = await mountIt()
    await flushPromises()
    await wrapper.find('main [data-frame-picture]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-image-viewer] [data-viewer-label]').text()).toBe('Frame 1 · 1 of 1')
    vi.unstubAllGlobals()
  })

  it('queues a render of every Frame that needs one, skipping blocked ones', async () => {
    vi.mocked(api.getSession).mockResolvedValue(storyboard([
      frame(0, { pictures: [picture('frame-0-aaaaaaaa.png')] }),
      frame(1, { blocked: 'no minors' }),
      frame(2, { pictures: [picture('frame-2-aaaaaaaa.png', { stale: true })] }),
      frame(3),
      // By another Image Model than the Storyboard's.
      frame(4, { pictures: [picture('frame-4-aaaaaaaa.png', { imageModel: 'flux2-klein-4b' })] }),
    ]))
    const { wrapper } = await mountIt()
    expect(wrapper.findAll('[data-status]').map((s) => s.text())).toEqual([
      'Rendered',
      'Blocked',
      'Changed since render',
      'Draft',
      'Changed since render',
    ])
    await wrapper.find('[data-render-all]').trigger('click')
    await flushPromises()
    expect(vi.mocked(api.queueJob).mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ['render', 2],
      ['render', 3],
      ['render', 4],
    ])
    // All queued: nothing left to add.
    expect(wrapper.find('[data-render-all]').attributes('disabled')).toBeDefined()
  })

  it('edits a Frame by Action, keeping a declined Action to reword', async () => {
    vi.mocked(api.editStoryboardFrame).mockImplementation(async (_id, _i, _a, onEvent) =>
      onEvent({
        type: 'edited',
        outcome: 'declined',
        narration: 'Declined: no minors.',
        session: storyboard([frame(0), frame(1), frame(2)]),
      })
    )
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('make him twelve')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    expect(api.editStoryboardFrame).toHaveBeenCalledWith(
      'sb',
      0,
      'make him twelve',
      expect.any(Function),
    )
    expect(wrapper.find('[role=alert]').text()).toBe('Declined: no minors.')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('make him twelve')
  })

  it("sweeps the Frame's sentences while an Action rewrites them", async () => {
    const stream = held()
    vi.mocked(api.editStoryboardFrame).mockImplementation((_id, _i, _a, onEvent) =>
      stream.call(onEvent)
    )
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-rewriting]').exists()).toBe(false)
    await wrapper.find('textarea').setValue('he jumps')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-rewriting]').classes()).toContain('render-sweep')
    stream.finish()
    await flushPromises()
    expect(wrapper.find('[data-rewriting]').exists()).toBe(false)
  })

  it('continues as a Chain from the Frame shown, and opens it', async () => {
    vi.mocked(api.chainFromStoryboard).mockResolvedValue({ id: 'ch', kind: 'chain' } as never)
    const { wrapper, router } = await mountIt()
    await wrapper.findAll('[data-frame]')[1].trigger('click')
    await wrapper.find('[data-continue-chain]').trigger('click')
    await flushPromises()
    expect(api.chainFromStoryboard).toHaveBeenCalledWith('sb', 1)
    expect(router.currentRoute.value.path).toBe('/sessions/ch')
  })

  it("can't continue as a Chain from a blocked Frame", async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      storyboard([frame(0, { blocked: 'no nudity' }), frame(1)]),
    )
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-continue-chain]').attributes('disabled')).toBeDefined()
  })

  it('saves a hand-edited Frame', async () => {
    vi.mocked(api.saveFrameBody).mockResolvedValue(
      storyboard([frame(0, { body: 'New body.' }), frame(1), frame(2)]),
    )
    const { wrapper } = await mountIt()
    const frameStatus = () => wrapper.find('[data-frame-editor] [data-save-status]').text()

    await wrapper.find('[data-field="storyboard.frame"]').setValue('New body.')
    expect(frameStatus()).toContain('Saves when you click away')
    expect(api.saveFrameBody).not.toHaveBeenCalled()
    await wrapper.find('[data-frame-editor]').trigger('focusout')
    await flushPromises()
    expect(api.saveFrameBody).toHaveBeenCalledWith('sb', 0, 'New body.', ['Rin'])
    expect(frameStatus()).toContain('Saved')
  })

  it('saves a hand-edited Beat and the Look while reviewing the plan', async () => {
    const plan = storyboard([planned(0), planned(1), planned(2)])
    vi.mocked(api.getSession).mockResolvedValue(plan)
    vi.mocked(api.saveBeat).mockResolvedValue(
      storyboard([planned(0, { beat: 'Rin dunks.' }), planned(1), planned(2)]),
    )
    vi.mocked(api.saveLook).mockResolvedValue(plan)
    const { wrapper } = await mountIt()

    await wrapper.find('[data-field="storyboard.frame"]').setValue('Rin dunks.')
    await wrapper.find('[data-frame-editor]').trigger('focusout')
    await flushPromises()
    expect(api.saveBeat).toHaveBeenCalledWith('sb', 0, 'Rin dunks.', ['Rin'])
    expect(api.saveFrameBody).not.toHaveBeenCalled()

    await wrapper.find('[data-look] textarea').setValue('Rin, a short student.')
    await wrapper.find('[data-look]').trigger('focusout')
    await flushPromises()
    expect(api.saveLook).toHaveBeenCalledWith('sb', {
      subjects: [
        { name: 'Rin', identity: 'Rin, a short student.' },
        { name: 'Kai', identity: 'Kai, a short student.' },
      ],
      style: 'Manga ink.',
    })
  })

  it('adds a Beat after the selected Frame while reviewing the plan, saving an edit first', async () => {
    vi.mocked(api.getSession).mockResolvedValue(storyboard([planned(0), planned(1), planned(2)]))
    vi.mocked(api.saveBeat).mockResolvedValue(
      storyboard([planned(0, { beat: 'Rin dunks.' }), planned(1), planned(2)]),
    )
    const added = planned(1, { beat: 'Kai blocks.' })
    vi.mocked(api.insertBeat).mockResolvedValue(
      storyboard([planned(0), added, { ...planned(1), index: 2 }, { ...planned(2), index: 3 }]),
    )
    const { wrapper } = await mountIt()
    // Only in the Prompt panel, for the selected Frame: none in the list.
    expect(wrapper.findAll('[data-add-beat]')).toHaveLength(1)
    expect(wrapper.find('[data-frames-panel] [data-add-beat]').exists()).toBe(false)

    await wrapper.find('[data-field="storyboard.frame"]').setValue('Rin dunks.')
    await wrapper.find('[data-add-beat]').trigger('click')
    expect(wrapper.find('[data-add-beat]').exists()).toBe(false)
    const box = wrapper.find('[data-adding-beat] textarea')
    expect(wrapper.find('[data-adding-beat]').text()).toContain('Frame 2')
    await box.setValue('  Kai blocks. ')
    await box.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(api.saveBeat).toHaveBeenCalledWith('sb', 0, 'Rin dunks.', ['Rin'])
    expect(api.insertBeat).toHaveBeenCalledWith('sb', 1, 'Kai blocks.')
    expect(wrapper.find('[data-adding-beat]').exists()).toBe(false)
    expect(wrapper.findAll('[data-frame]')).toHaveLength(4)
    expect(wrapper.find('[data-frame][aria-current="true"]').text()).toContain('Kai blocks.')
  })

  it('lets a Beat being added go with Esc, or on picking another Frame; none once written', async () => {
    vi.mocked(api.getSession).mockResolvedValue(storyboard([planned(0), planned(1)]))
    const { wrapper } = await mountIt()
    await wrapper.findAll('[data-frame]')[1].trigger('click')
    await wrapper.find('[data-add-beat]').trigger('click')
    expect(wrapper.find('[data-adding-beat]').text()).toContain('Frame 3')
    await wrapper.find('[data-adding-beat] textarea').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-adding-beat]').exists()).toBe(false)
    await wrapper.find('[data-add-beat]').trigger('click')
    await wrapper.findAll('[data-frame]')[0].trigger('click')
    expect(wrapper.find('[data-adding-beat]').exists()).toBe(false)
    expect(api.insertBeat).not.toHaveBeenCalled()
    wrapper.unmount()

    vi.mocked(api.getSession).mockResolvedValue(storyboard([frame(0), planned(1)]))
    const written = (await mountIt()).wrapper
    expect(written.find('[data-beat-actions]').exists()).toBe(false)
  })

  it('removes a Beat once confirmed, dropping an edit to it', async () => {
    vi.mocked(api.getSession).mockResolvedValue(storyboard([planned(0), planned(1), planned(2)]))
    vi.mocked(api.removeBeat).mockResolvedValue(
      storyboard([planned(0), { ...planned(2), index: 1 }]),
    )
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    const { wrapper } = await mountIt()
    await wrapper.findAll('[data-frame]')[1].trigger('click')
    await wrapper.find('[data-field="storyboard.frame"]').setValue('Half typed')

    await wrapper.find('[data-remove-beat]').trigger('click')
    expect(api.removeBeat).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    await wrapper.find('[data-remove-beat]').trigger('click')
    await flushPromises()

    expect(api.saveBeat).not.toHaveBeenCalled()
    expect(api.removeBeat).toHaveBeenCalledWith('sb', 1, {
      frames: 3,
      createdAt: '2026-09-25T00:00:00.000Z',
    })
    expect(wrapper.findAll('[data-frame]').map((f) => f.text())).toEqual([
      expect.stringContaining('Beat 1.'),
      expect.stringContaining('Beat 3.'),
    ])
    expect(wrapper.find('[data-frame][aria-current="true"]').text()).toContain('Beat 3.')
  })

  it('offers no Remove for the last Beat left, or once Frames are written', async () => {
    vi.mocked(api.getSession).mockResolvedValue(storyboard([planned(0)]))
    expect((await mountIt()).wrapper.findAll('[data-remove-beat]')).toHaveLength(0)
    vi.mocked(api.getSession).mockResolvedValue(storyboard([frame(0), planned(1)]))
    expect((await mountIt()).wrapper.findAll('[data-remove-beat]')).toHaveLength(0)
  })

  it('chooses who a Frame shows', async () => {
    vi.mocked(api.saveFrameBody).mockImplementation(async (_id, _index, body, shown) =>
      storyboard([frame(0, { body, shown }), frame(1), frame(2)])
    )
    const { wrapper } = await mountIt()
    const chips = () => wrapper.findAll('[data-shown] button')
    expect(chips().map((c) => [c.text(), c.attributes('aria-pressed')])).toEqual([
      ['Rin', 'true'],
      ['Kai', 'false'],
    ])
    // Each click saves, one after the other.
    await chips()[1].trigger('click')
    await chips()[0].trigger('click')
    await flushPromises()
    expect(vi.mocked(api.saveFrameBody).mock.calls).toEqual([
      ['sb', 0, 'Body 1.', ['Rin', 'Kai']],
      ['sb', 0, 'Body 1.', ['Kai']],
    ])
  })

  it('adds and removes people from the Look while reviewing the plan', async () => {
    vi.mocked(api.getSession).mockResolvedValue(storyboard([planned(0), planned(1), planned(2)]))
    const { wrapper } = await mountIt()
    expect(wrapper.findAll('[data-subject]')).toHaveLength(2)
    await wrapper.find('[data-add-subject]').trigger('click')
    expect(wrapper.findAll('[data-subject]')).toHaveLength(3)
    // Removing saves at once, except while someone's left without a name.
    await wrapper.find('[aria-label="Remove Rin"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-subject-name]').map((i) => (i.element as HTMLInputElement).value))
      .toEqual(['Kai', ''])
    expect(api.saveLook).not.toHaveBeenCalled()
    expect(wrapper.find('[data-look] [data-save-status]').text())
      .toContain('Not saved: each subject needs a name and an identity')
  })

  it('keeps someone renamed in the Look shown when a Shows pill is clicked straight after', async () => {
    // As the server does: a rename carries over to who each Frame shows, and an unknown name is
    // dropped.
    let saved = storyboard([planned(0), planned(1), planned(2)])
    vi.mocked(api.getSession).mockResolvedValue(saved)
    vi.mocked(api.saveLook).mockImplementation(async (_id, l) => {
      await new Promise((r) => setTimeout(r, 20))
      const renamed = (n: string) =>
        l.subjects[saved.look!.subjects.findIndex((p) => p.name === n)]?.name
      saved = {
        ...saved,
        look: l,
        frames: saved.frames.map((f) => ({
          ...f,
          shown: f.shown.map(renamed).filter(Boolean) as string[],
        })),
      }
      return saved
    })
    vi.mocked(api.saveBeat).mockImplementation(async (_id, index, beat, shown) => {
      const known = shown.filter((n) => saved.look!.subjects.some((p) => p.name === n))
      saved = {
        ...saved,
        frames: saved.frames.map((f) => (f.index === index ? { ...f, beat, shown: known } : f)),
      }
      return saved
    })
    const { wrapper } = await mountIt()
    await wrapper.find('[data-subject-name]').setValue('Mira')
    const kai = wrapper.findAll('[data-shown] button')[1]
    await wrapper.find('[data-look]').trigger('focusout', { relatedTarget: kai.element })
    await kai.trigger('click')
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()
    expect(saved.frames[0].shown).toEqual(['Mira', 'Kai'])
    expect(wrapper.findAll('[data-shown] button').map((b) => b.text())).toEqual(['Mira', 'Kai'])
  })

  it('saves a hand edit before queueing a render', async () => {
    vi.mocked(api.saveFrameBody).mockResolvedValue(
      storyboard([frame(0, { body: 'New body.' }), frame(1), frame(2)]),
    )
    vi.mocked(api.queueJob).mockResolvedValue([])
    const { wrapper } = await mountIt()
    await wrapper.find('[data-field="storyboard.frame"]').setValue('New body.')
    await wrapper.find('[data-render-button]').trigger('click')
    await flushPromises()
    expect(api.queueJob).toHaveBeenCalledWith('sb', 'render', 0)
    expect(vi.mocked(api.saveFrameBody).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.queueJob).mock.invocationCallOrder[0],
    )
  })

  it('says when a Frame shows no one', async () => {
    vi.mocked(api.getSession).mockResolvedValue(storyboard([frame(0, { shown: [] })]))
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-shown]').text()).toContain('the place alone')
  })

  it('shows why a hand edit was refused', async () => {
    vi.mocked(api.saveFrameBody).mockRejectedValue(new Error('This crosses a limit: no minors'))
    const { wrapper } = await mountIt()
    await wrapper.find('[data-field="storyboard.frame"]').setValue('A child.')
    await wrapper.find('[data-frame-editor]').trigger('focusout')
    await flushPromises()
    expect(wrapper.find('[data-frame-editor] [role=alert]').text())
      .toBe('Not saved: This crosses a limit: no minors')
  })

  it('queues an upscale and 3D of a rendered Frame, not of a draft', async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      storyboard([frame(0, { pictures: [picture('frame-0-aaaaaaaa.png')] }), frame(1)]),
    )
    const { wrapper } = await mountIt()
    await wrapper.find('[data-upscale-button]').trigger('click')
    await flushPromises()
    expect(api.queueJob).toHaveBeenCalledWith('sb', 'upscale', 0)
    expect(wrapper.find('[data-upscale-button]').attributes('disabled')).toBeDefined()

    // A draft has no picture to upscale or make into 3D, until a render is queued.
    await wrapper.findAll('[data-frame]')[1].trigger('click')
    expect(wrapper.find('[data-upscale-button]').exists()).toBe(false)
    await wrapper.find('[data-render-button]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-upscale-button]').exists()).toBe(true)
  })
})
