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
  renderStoryboardFrame: vi.fn(),
  editStoryboardFrame: vi.fn(),
  saveFrameBody: vi.fn(),
  saveLook: vi.fn(),
  cancelFrame: vi.fn(),
  upscaleFrame: vi.fn(),
}))

const look: api.Look = { subject: 'A tall student.', style: 'Manga ink.' }

const frame = (index: number, extra: Partial<api.StoryboardFrame> = {}): api.StoryboardFrame => ({
  index,
  beat: `Beat ${index + 1}.`,
  body: `Body ${index + 1}.`,
  prompt: promptFor(index),
  promptText: `A tall student. Body ${index + 1}. Manga ink.`,
  image: null,
  createdAt: '2026-09-25T00:00:00.000Z',
  ...extra,
})

const storyboard = (frames: api.StoryboardFrame[] = []): api.StoryboardSession => ({
  id: 'sb',
  kind: 'storyboard',
  brief: 'A first dunk.',
  scenarioId: null,
  settings: {} as api.Settings,
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
  for (const fn of [api.planStoryboard, api.renderStoryboardFrame, api.editStoryboardFrame]) {
    vi.mocked(fn).mockReset()
  }
  vi.mocked(api.getSession).mockResolvedValue(storyboard([frame(0), frame(1), frame(2)]))
})

afterEach(() => vi.unstubAllGlobals())
enableAutoUnmount(afterEach)

describe('StoryboardView', () => {
  it('plans a new Storyboard, listing Beats and Frames as they arrive', async () => {
    vi.mocked(api.getSession).mockResolvedValue(storyboard())
    const stream = held()
    vi.mocked(api.planStoryboard).mockImplementation((_id, onEvent) => stream.call(onEvent))
    const { wrapper } = await mountIt()

    expect(wrapper.find('[role=status]').text()).toBe('Planning the Storyboard…')
    stream.emit({ type: 'look', look })
    stream.emit({ type: 'beats', beats: ['Beat 1.', 'Beat 2.', 'Beat 3.'] })
    stream.emit({ type: 'planned-frame', frame: frame(0) })
    await flushPromises()
    expect(wrapper.findAll('[data-frame]')).toHaveLength(3)
    expect(wrapper.findAll('[data-frame]')[1].text()).toContain('Writing…')
    expect(wrapper.find('[role=status]').text()).toBe('Writing Frame 2 of 3…')

    stream.emit({ type: 'planned', session: storyboard([frame(0), frame(1), frame(2)]) })
    stream.finish()
    await flushPromises()
    expect(wrapper.find('[role=status]').exists()).toBe(false)
    expect(wrapper.findAll('[data-status]').map((s) => s.text())).toEqual([
      'Draft',
      'Draft',
      'Draft',
    ])
    expect(useCurrentSession().currentSessionKind.value).toBe('storyboard')
  })

  it('starts the listed plan over when a retry sends a new Look', async () => {
    vi.mocked(api.getSession).mockResolvedValue(storyboard())
    const stream = held()
    vi.mocked(api.planStoryboard).mockImplementation((_id, onEvent) => stream.call(onEvent))
    const { wrapper } = await mountIt()
    stream.emit({ type: 'look', look })
    stream.emit({ type: 'beats', beats: ['Old 1.', 'Old 2.'] })
    stream.emit({ type: 'look', look })
    await flushPromises()
    expect(wrapper.findAll('[data-frame]')).toHaveLength(0)
    stream.emit({ type: 'beats', beats: ['New 1.', 'New 2.', 'New 3.'] })
    await flushPromises()
    expect(wrapper.findAll('[data-frame]').map((f) => f.text())).toEqual([
      '1New 1.Writing…',
      '2New 2.Writing…',
      '3New 3.Writing…',
    ])
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

  it('renders the selected Frame', async () => {
    vi.mocked(api.renderStoryboardFrame).mockImplementation(async (_id, index, onEvent) =>
      onEvent({ type: 'rendered', frame: frame(index, { image: `frame-${index}-aaaaaaaa.png` }) })
    )
    const { wrapper } = await mountIt()
    await wrapper.findAll('[data-frame]')[1].trigger('click')
    await buttonNamed(wrapper, 'Render Frame 2').trigger('click')
    await flushPromises()
    expect(api.renderStoryboardFrame).toHaveBeenCalledWith('sb', 1, expect.any(Function))
    expect(wrapper.findAll('[data-status]').map((s) => s.text())).toEqual([
      'Draft',
      'Rendered',
      'Draft',
    ])
    expect(buttonNamed(wrapper, 'Re-render Frame 2').exists()).toBe(true)
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
      storyboard([frame(0, { image: 'frame-0-aaaaaaaa.png' }), frame(1)]),
    )
    const { wrapper } = await mountIt()
    await flushPromises()
    await wrapper.find('main [data-frame-picture]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-image-viewer] [data-viewer-label]').text()).toBe('Frame 1 · 1 of 1')
    vi.unstubAllGlobals()
  })

  it('renders all Frames that need it, one at a time, skipping blocked ones', async () => {
    vi.mocked(api.getSession).mockResolvedValue(storyboard([
      frame(0, { image: 'frame-0-aaaaaaaa.png' }),
      frame(1, { blocked: 'no minors' }),
      frame(2, { image: 'frame-2-aaaaaaaa.png', stale: true }),
    ]))
    vi.mocked(api.renderStoryboardFrame).mockImplementation(async (_id, index, onEvent) =>
      onEvent({ type: 'rendered', frame: frame(index, { image: `frame-${index}-bbbbbbbb.png` }) })
    )
    const { wrapper } = await mountIt()
    await buttonNamed(wrapper, 'Render all (1)').trigger('click')
    await flushPromises()
    expect(vi.mocked(api.renderStoryboardFrame).mock.calls.map((c) => c[1])).toEqual([2])
    expect(buttonNamed(wrapper, 'Render all').attributes('disabled')).toBeDefined()
  })

  it('stops rendering all when cancelled', async () => {
    const stream = held()
    vi.mocked(api.renderStoryboardFrame).mockImplementation((_id, _i, onEvent) =>
      stream.call(onEvent)
    )
    const { wrapper } = await mountIt()
    await buttonNamed(wrapper, 'Render all').trigger('click')
    await buttonNamed(wrapper, 'Cancel').trigger('click')
    expect(api.cancelFrame).toHaveBeenCalledWith('sb')
    stream.emit({ type: 'cancelled', sessionDiscarded: false })
    stream.finish()
    await flushPromises()
    expect(api.renderStoryboardFrame).toHaveBeenCalledTimes(1)
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

  it('saves a hand-edited Frame and the Look', async () => {
    vi.mocked(api.saveFrameBody).mockResolvedValue(
      storyboard([frame(0, { body: 'New body.' }), frame(1), frame(2)]),
    )
    vi.mocked(api.saveLook).mockResolvedValue(storyboard([frame(0), frame(1), frame(2)]))
    const { wrapper } = await mountIt()

    await wrapper.find('[data-body]').setValue('New body.')
    expect(buttonNamed(wrapper, 'Save Frame 1').exists()).toBe(true)
    await wrapper.find('[data-frame-editor]').trigger('submit')
    await flushPromises()
    expect(api.saveFrameBody).toHaveBeenCalledWith('sb', 0, 'New body.')
    expect(buttonNamed(wrapper, 'Save Frame 1')).toBeUndefined()

    await wrapper.find('[data-look] textarea').setValue('A short student.')
    expect(buttonNamed(wrapper, 'Save Look').exists()).toBe(true)
    await wrapper.find('[data-look]').trigger('submit')
    await flushPromises()
    expect(api.saveLook).toHaveBeenCalledWith('sb', {
      subject: 'A short student.',
      style: 'Manga ink.',
    })
  })

  it('shows why a hand edit was refused', async () => {
    vi.mocked(api.saveFrameBody).mockRejectedValue(new Error('This crosses a limit: no minors'))
    const { wrapper } = await mountIt()
    await wrapper.find('[data-body]').setValue('A child.')
    await wrapper.find('[data-frame-editor]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role=alert]').text()).toBe('This crosses a limit: no minors')
  })

  it('upscales a rendered Frame, marking it Upscaled', async () => {
    const rendered = frame(0, { image: 'frame-0-aaaaaaaa.png' })
    vi.mocked(api.getSession).mockResolvedValue(storyboard([rendered, frame(1)]))
    vi.mocked(api.upscaleFrame).mockImplementation(async (_id, _i, onEvent) =>
      onEvent({
        type: 'upscaled',
        session: storyboard([{ ...rendered, upscaled: 'frame-0-aaaaaaaa-2048.png' }, frame(1)]),
      })
    )
    const { wrapper } = await mountIt()
    await wrapper.find('[data-upscale]').trigger('click')
    await flushPromises()
    expect(api.upscaleFrame).toHaveBeenCalledWith('sb', 0, expect.any(Function))
    expect(wrapper.findAll('[data-status]')[0].text()).toBe('Upscaled')
    expect(wrapper.find('[data-upscale]').attributes('disabled')).toBeDefined()

    // A Frame with no image yet can't be upscaled.
    await wrapper.findAll('[data-frame]')[1].trigger('click')
    expect(wrapper.find('[data-upscale]').attributes('disabled')).toBeDefined()
  })
})
