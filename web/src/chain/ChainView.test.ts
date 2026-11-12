import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ask } from '../ask'
import FrameClips from '../components/FrameClips.vue'
import ImageModelPicker from '../components/ImageModelPicker.vue'
import AllFrames from '../components/AllFrames.vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '../api'
import { ALL_AVAILABLE, IMAGE_MODELS, promptFor } from '../testing'
import { loadSettingsOptions } from '../composables/useSettingsOptions'
import ChainView from './ChainView.vue'

vi.mock('../ask', () => ({ ask: vi.fn() }))
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSession: vi.fn(),
  streamFrame: vi.fn(),
  cancelFrame: vi.fn(),
  endSession: vi.fn(),
  createSession: vi.fn(),
  undoFrames: vi.fn(),
  deleteChainFrame: vi.fn(),
  saveChainPrompt: vi.fn(),
  getSettings: vi.fn(),
  getSettingsOptions: vi.fn(),
  setImageModel: vi.fn(),
  listJobs: vi.fn(),
  queueJob: vi.fn(),
  cancelJob: vi.fn(),
  retryJob: vi.fn(),
}))

/** A picture by the Chain's Image Model. */
const picture = (image: string, extra: Partial<api.Picture> = {}): api.Picture => ({
  image,
  imageModel: 'qwen-image-2.1',
  ...extra,
})

const frame = (
  index: number,
  action: string | null,
  extra: Partial<api.ChainFrame> = {},
): api.ChainFrame => ({
  index,
  action,
  prompt: promptFor(index),
  narration: `Narration ${index}.`,
  outcome: 'done',
  timings: { text: 1 },
  textModel: 'x',
  pictures: [picture(`frame-${index}.png`)],
  createdAt: '2026-09-24T00:00:00.000Z',
  ...extra,
})

const job = (extra: Partial<api.Job>): api.Job => ({
  id: 'j1',
  machine: 'here',
  kind: 'upscale',
  frameIndex: 0,
  status: 'queued',
  createdAt: '2026-10-05T00:00:00.000Z',
  ...extra,
})

const session = (frames: api.ChainFrame[] = []): api.ChainSession => ({
  id: 's1',
  kind: 'chain',
  brief: null,
  scenarioId: 'tavern',
  settings: { imageModel: 'qwen-image-2.1' } as api.Settings,
  seed: 1,
  createdAt: '2026-09-24T00:00:00.000Z',
  frames,
})

async function mountIt() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: {} }, { path: '/sessions/:id', component: {} }],
  })
  await router.push('/sessions/s1')
  const wrapper = mount(ChainView, { props: { id: 's1' }, global: { plugins: [router] } })
  await flushPromises()
  await loadImages()
  return { wrapper, router }
}

/** Stands in for the browser's image loader; `load` finishes the next pending preload. */
const preloads: (() => void)[] = []
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  set src(_: string) {
    preloads.push(() => this.onload?.())
  }
}
const loadImages = async () => {
  while (preloads.length) preloads.shift()!()
  await flushPromises()
}

type Wrapper = Awaited<ReturnType<typeof mountIt>>['wrapper']
const buttonNamed = (wrapper: Wrapper, name: string) =>
  wrapper.findAll('button').find((b) => b.text() === name)!
/** The strip's tiles, a tile per Frame. */
const tiles = (wrapper: Wrapper) => wrapper.findAll('[data-tile]')
/** Opens a menu (`PopMenu`) by its button, unless it's open already. */
async function openMenu(wrapper: Wrapper, button: string) {
  if (!wrapper.find(button).element.closest('[data-open]')) {
    await wrapper.find(button).trigger('click')
  }
}
/** Opens the drawer at the shown Frame's Image Prompt. */
const openPrompt = (wrapper: Wrapper) => wrapper.find('[data-see-changes]').trigger('click')

beforeEach(async () => {
  vi.mocked(api.getSettingsOptions).mockResolvedValue(
    {
      features: ALL_AVAILABLE,
      imageModels: IMAGE_MODELS,
      imageBackends: ['mflux'],
    } as api.SettingsOptions,
  )
  await loadSettingsOptions()
  localStorage.clear()
  preloads.length = 0
  vi.stubGlobal('Image', FakeImage)
  vi.mocked(api.streamFrame).mockReset()
  vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null)]))
  vi.mocked(api.listJobs).mockReset().mockResolvedValue([])
  vi.mocked(api.queueJob).mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
// Unmounted screens would leave window listeners (e.g. "Leave site?") behind for later tests.
enableAutoUnmount(afterEach)

describe('ChainView', () => {
  it('runs the Opening Frame for a new Session, showing provisional text first', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session())
    let emit!: (e: api.FrameEvent) => void
    let finish!: () => void
    vi.mocked(api.streamFrame).mockImplementation((_id, action, onEvent) => {
      expect(action).toBeNull()
      emit = onEvent
      return new Promise((r) => (finish = r))
    })
    const { wrapper } = await mountIt()

    await flushPromises()
    expect(wrapper.find('[data-writing]').exists()).toBe(true)
    expect(wrapper.find('[data-rendering]').exists()).toBe(false)

    vi.mocked(api.listJobs).mockClear()
    emit({ type: 'committed', frame: frame(0, null, { narration: 'Kael looks up.' }) })
    finish()
    await loadImages()
    // Its picture is a render job, queued as it was saved (ADR 0030): the queue is fetched for it.
    expect(api.listJobs).toHaveBeenCalledWith('s1')
    expect(wrapper.find('.render-sweep').exists()).toBe(false)
    expect(wrapper.find('[data-writing]').exists()).toBe(false)
    expect(wrapper.find('img').attributes('src')).toBe('/api/sessions/s1/images/frame-0.png')
  })

  it('sends the Direction on Enter and clears it once committed', async () => {
    vi.mocked(api.streamFrame).mockImplementation((_id, _action, onEvent) => {
      onEvent({ type: 'committed', frame: frame(1, 'Sit down') })
      return Promise.resolve()
    })
    const { wrapper } = await mountIt()
    const textarea = wrapper.find('textarea')
    await textarea.setValue('Sit down')
    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(api.streamFrame).toHaveBeenCalledWith('s1', 'Sit down', expect.any(Function), true)
    expect((textarea.element as HTMLTextAreaElement).value).toBe('')
    expect(tiles(wrapper)).toHaveLength(2)
  })

  it('makes no Frame for an unclear Action: it stays in the box, with the question in blue', async () => {
    vi.mocked(api.streamFrame).mockImplementationOnce((_id, _action, onEvent) => {
      onEvent({ type: 'unclear', message: 'Which backdrop do you mean?' })
      return Promise.resolve()
    })
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('make it weird')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('make it weird')
    expect(tiles(wrapper)).toHaveLength(1)
    const notice = wrapper.find('[data-frame-notice]')
    expect([notice.text(), notice.classes()]).toEqual([
      'Which backdrop do you mean?',
      expect.arrayContaining(['text-info']),
    ])
  })

  it('makes no Frame for an Action that changed nothing in the picture, saying so in blue', async () => {
    vi.mocked(api.streamFrame).mockImplementationOnce((_id, _action, onEvent) => {
      onEvent({ type: 'unchanged', message: 'Nothing in the picture changed.' })
      return Promise.resolve()
    })
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('wait a moment')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('wait a moment')
    expect(tiles(wrapper)).toHaveLength(1)
    const notice = wrapper.find('[data-frame-notice]')
    expect([notice.text(), notice.classes()]).toEqual([
      'Nothing in the picture changed.',
      expect.arrayContaining(['text-info']),
    ])
  })

  it('makes no Frame for a declined Action: it stays in the box, with the reason beside it', async () => {
    vi.mocked(api.streamFrame).mockImplementationOnce((_id, _action, onEvent) => {
      onEvent({ type: 'phase', phase: 'text' })
      onEvent({ type: 'declined', message: 'Declined: no sexual or nude imagery.' })
      return Promise.resolve()
    })
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('make her topless')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('make her topless')
    expect(tiles(wrapper)).toHaveLength(1)
    const notice = wrapper.find('[data-frame-notice]')
    expect([notice.text(), notice.classes()]).toEqual([
      'Declined: no sexual or nude imagery.',
      expect.arrayContaining(['text-warn']),
    ])
    // Sending again clears it.
    vi.mocked(api.streamFrame).mockImplementationOnce((_id, _action, onEvent) => {
      onEvent({ type: 'committed', frame: frame(1, 'sit down') })
      return Promise.resolve()
    })
    await wrapper.find('textarea').setValue('sit down')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-frame-notice]').exists()).toBe(false)
  })

  it('keeps the Direction and shows the error when a Frame fails', async () => {
    vi.mocked(api.streamFrame).mockImplementation((_id, _action, onEvent) => {
      onEvent({ type: 'failed', message: 'mflux crashed', sessionDiscarded: false })
      return Promise.resolve()
    })
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('Sit down')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role=alert]').text()).toBe('mflux crashed')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Sit down')
  })

  it('offers Cancel while a Frame runs', async () => {
    vi.mocked(api.streamFrame).mockImplementation(() => new Promise(() => {}))
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('Sit down')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    expect(wrapper.find('textarea').attributes('disabled')).toBeDefined()
    await buttonNamed(wrapper, 'Cancel').trigger('click')
    expect(api.cancelFrame).toHaveBeenCalledWith('s1')
  })

  it('returns to the start screen when the Opening Frame is discarded', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session())
    vi.mocked(api.streamFrame).mockImplementation((_id, _action, onEvent) => {
      onEvent({ type: 'failed', message: 'Ollama: model not found', sessionDiscarded: true })
      return Promise.resolve()
    })
    const { router } = await mountIt()
    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.query.error).toBe('Ollama: model not found')
  })

  it('puts a new Frame in the strip at once, shown blank while it is written', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null)]))
    vi.mocked(api.streamFrame).mockImplementation(() => new Promise(() => {}))
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('Sit down')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    const entry = wrapper.find('[data-pending-frame]')
    // Named as the strip numbers its tiles, from 1: the second.
    expect(entry.attributes('title')).toMatch(/^Frame 2: /)
    expect(entry.attributes('aria-current')).toBe('true')
    // Its Action beside the picture's place; the Opening's picture is gone: the new Frame has none.
    expect(wrapper.find('[data-pending-action]').text()).toBe('Sit down')
    expect(wrapper.find('main [data-frame-picture]').exists()).toBe(false)

    // An earlier Frame can be looked at meanwhile, and the new one picked again.
    await tiles(wrapper)[0].trigger('click')
    await loadImages()
    expect(wrapper.find('main [data-frame-picture]').attributes('src')).toContain('frame-0.png')
    expect(wrapper.find('[data-pending-frame]').attributes('aria-current')).toBe('false')
    await wrapper.find('[data-pending-frame]').trigger('click')
    expect(wrapper.find('[data-pending-frame]').attributes('aria-current')).toBe('true')
  })

  it('moves through the Frames with ← and → in the strip', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null), frame(1, 'Sit')]))
    const { wrapper } = await mountIt()
    const current = () => tiles(wrapper).findIndex((f) => f.attributes('aria-current') === 'true')
    const press = async (key: string) => {
      await wrapper.find('[data-strip]').trigger('keydown', { key })
      await flushPromises()
    }
    expect(current()).toBe(1)
    await press('ArrowLeft')
    expect(current()).toBe(0)
    await press('ArrowLeft')
    expect(current()).toBe(0)
    await press('ArrowRight')
    expect(current()).toBe(1)
  })

  it('shows an earlier Frame when picked from the Frames', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null), frame(1, 'Sit')]))
    const { wrapper } = await mountIt()
    expect(wrapper.find('main img').attributes('src')).toContain('frame-1.png')
    await tiles(wrapper)[0].trigger('click')
    // The old image stays until the new one has loaded, then crossfades.
    expect(wrapper.find('main img').attributes('src')).toContain('frame-1.png')
    await loadImages()
    expect(wrapper.find('main img').attributes('src')).toContain('frame-0.png')
  })

  it('shows the Action and its Narration beside the picture', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null), frame(1, 'Sit')]))
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-action]').text()).toBe('Sit')
    expect(wrapper.find('[data-caption]').text()).toBe('Narration 1.')
    await tiles(wrapper)[0].trigger('click')
    expect(wrapper.find('[data-action]').text()).toBe('Opening')
    expect(wrapper.find('[data-caption]').text()).toBe('Narration 0.')
  })

  it("shows the viewed Frame's Image Prompt as a word diff against the Frame before", async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([
        frame(0, null),
        frame(1, 'Sit', { prompt: promptFor(1).replace('calm', 'scared') }),
      ]),
    )
    const { wrapper } = await mountIt()
    await openPrompt(wrapper)
    expect(wrapper.find('[data-drawer]').attributes('data-drawer-tab')).toBe('prompt')
    const panel = wrapper.find('[data-prompt-panel]')
    expect(panel.text()).toContain('Frame 2 · Sit')
    expect(panel.findAll('[data-diff=removed]').map((d) => d.text())).toEqual(['0, calm,'])
    expect(panel.findAll('[data-diff=added]').map((d) => d.text())).toEqual(['1, scared,'])
    expect(panel.text()).toContain('since Frame 1')
  })

  it('can hide the removed words, remembering the choice', async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([
        frame(0, null),
        frame(1, 'Sit', { prompt: promptFor(1).replace('calm', 'scared') }),
      ]),
    )
    const { wrapper } = await mountIt()
    await openPrompt(wrapper)
    expect(wrapper.findAll('[data-diff=removed]')).toHaveLength(1)

    await wrapper.find('[data-show-removed]').setValue(false)
    expect(wrapper.findAll('[data-diff=removed]')).toHaveLength(0)
    expect(wrapper.findAll('[data-diff=added]')).toHaveLength(1)
    expect(wrapper.find('[data-prompt]').text()).toBe(promptFor(1).replace('calm', 'scared'))
    expect(localStorage.getItem('diff-removed-hidden')).toBe('1')

    await wrapper.find('[data-show-removed]').setValue(true)
    expect(wrapper.findAll('[data-diff=removed]')).toHaveLength(1)
  })

  it("shows how long the viewed Frame's steps took", async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([
        frame(0, null, {
          timings: { text: 9.8 },
          pictures: [picture('frame-0.png', { timings: { queued: 12.3, image: 5.1 } })],
        }),
        frame(1, 'Stay', { pictures: [], timings: { text: 3 } }),
      ]),
    )
    const { wrapper } = await mountIt()
    // Not rendered yet.
    expect(wrapper.find('[data-timings]').text()).toBe('Text 3.0 s by x')
    await tiles(wrapper)[0].trigger('click')
    expect(wrapper.find('[data-timings]').text()).toBe(
      'Text 9.8 s by x · Waited 12.3 s · Image 5.1 s · by Qwen-Image 2.1',
    )
  })

  it('shows the Opening prompt without any diff', async () => {
    const { wrapper } = await mountIt()
    expect(wrapper.findAll('[data-diff=added], [data-diff=removed]')).toHaveLength(0)
    expect(wrapper.find('[data-prompt]').text()).toBe(promptFor(0))
  })

  it('labels declined and unclear Frames beside the picture', async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([
        frame(0, null),
        frame(1, 'Take the jacket off', { outcome: 'declined' }),
        frame(2, 'asdf qwer', { outcome: 'unclear' }),
      ]),
    )
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-outcome]').text()).toBe("Didn't understand")
    await tiles(wrapper)[1].trigger('click')
    expect(wrapper.find('[data-outcome]').text()).toBe('Declined')
    await tiles(wrapper)[0].trigger('click')
    expect(wrapper.find('[data-outcome]').exists()).toBe(false)
  })

  it("shapes the frame to the Session's picture size before the first picture arrives", async () => {
    vi.mocked(api.getSession).mockResolvedValue({
      ...session(),
      imageSize: { width: 1024, height: 1024 },
    })
    vi.mocked(api.streamFrame).mockImplementation(() => new Promise(() => {}))
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-stage]').attributes('data-ratio')).toBe('1.000')
  })

  it('opens the picture in the viewer when clicked, stepping through the Frames', async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([
        frame(0, null),
        frame(1, 'Sit', { pictures: [picture('frame-1.png', { upscaled: 'frame-1-2048.png' })] }),
      ]),
    )
    const { wrapper } = await mountIt()
    await wrapper.find('main [data-picture-image]').trigger('click')
    await flushPromises()
    const viewer = () => wrapper.find('[data-image-viewer]')
    expect(viewer().find('[data-viewer-label]').text()).toBe('Frame 2 · 2 of 2')
    expect(viewer().find('[data-image-frame] img').attributes('src')).toContain('frame-1-2048.png')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await flushPromises()
    await flushPromises()
    expect(viewer().find('[data-viewer-label]').text()).toBe('Frame 1 · Opening · 1 of 2')
  })

  it('queues SHARP, TripoSplat and LiTo on the shown Frame, then offers to view what was made', async () => {
    vi.useFakeTimers()
    vi.mocked(api.queueJob).mockImplementation((_id, kind, frameIndex) =>
      Promise.resolve([job({ kind, frameIndex, status: 'running', phase: 'image' })])
    )
    const { wrapper } = await mountIt()
    // In the picture's 3D menu.
    await openMenu(wrapper, '[data-3d-menu-button]')
    await wrapper.find('[data-lito-button]').trigger('click')
    await flushPromises()
    expect(api.queueJob).toHaveBeenCalledWith('s1', 'lito', 0)
    // It runs beside the Chain: the menu's button and the picture's line say so, and the next
    // Action can go.
    expect(wrapper.find('[data-3d-menu-button] [data-icon="spinner"]').exists()).toBe(true)
    expect(wrapper.find('[data-jobs-line]').text()).toContain('LiTo · Making the 3D figure…')
    await openMenu(wrapper, '[data-3d-menu-button]')
    expect(wrapper.find('[data-lito-button]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('textarea').attributes('disabled')).toBeUndefined()

    // Once done, the Chain is reloaded with the figure on it.
    const figure: api.Figure = {
      file: 'lito-0-1a2b3c4d.ply',
      splats: 4,
      from: 'frame-0.png',
      timings: { figure: 90 },
    }
    vi.mocked(api.getSession).mockResolvedValue(
      session([frame(0, null, { pictures: [picture('frame-0.png', { lito: figure })] })]),
    )
    // The queue is checked every second; the job is gone, so the Chain is reloaded.
    await vi.advanceTimersByTimeAsync(1100)
    await flushPromises()
    await openMenu(wrapper, '[data-3d-menu-button]')
    expect(wrapper.find('[data-view-lito]').exists()).toBe(true)
    expect(wrapper.find('[data-figure-button]').exists()).toBe(true)
  })

  it("switches the Chain's Image Model, showing the steps it renders at", async () => {
    const chain = session([frame(0, null), frame(1, 'Sit')])
    chain.settings = { ...chain.settings, steps: 25 }
    vi.mocked(api.getSession).mockResolvedValue(chain)
    const { wrapper } = await mountIt()
    // Named in the bar; switched behind it.
    expect(wrapper.find('[data-session-settings-button]').text()).toBe('Qwen-Image 2.1')
    await openMenu(wrapper, '[data-session-settings-button]')
    const select = () => wrapper.find('[data-image-model]')
    const label = () => wrapper.find('[data-picture-label]').text()
    expect((select().element as HTMLSelectElement).value).toBe('mflux/qwen-image-2.1')
    // Up to date, it can still render again: with Settings' size and the rest as they are now.
    expect(label()).toBe('Frame 2 of 2')
    expect(wrapper.find('[data-render-button]').text()).toBe('Re-render')
    expect(select().findAll('option').map((o) => o.text()).sort()).toEqual([
      'FLUX.2 Klein 4B · mflux',
      'Qwen-Image 2.1 · mflux',
    ])
    expect(wrapper.find('[data-image-steps]').text()).toBe('25 steps a render')

    // The picture then shows as changed since render, and can render again.
    vi.mocked(api.setImageModel).mockResolvedValue({
      ...chain,
      settings: { ...chain.settings, imageModel: 'flux2-klein-4b', steps: 4 },
    })
    await select().setValue('mflux/flux2-klein-4b')
    await flushPromises()
    expect(api.setImageModel).toHaveBeenCalledWith('s1', 'flux2-klein-4b', 'mflux')
    await openMenu(wrapper, '[data-session-settings-button]')
    expect((select().element as HTMLSelectElement).value).toBe('mflux/flux2-klein-4b')
    expect(wrapper.find('[data-image-steps]').text()).toBe('4 steps a render')
    expect(label()).toBe('Frame 2 of 2 · changed since render by Qwen-Image 2.1')
    expect(wrapper.find('[data-render-button]').text()).toBe('Re-render')

    // Re-rendering it shows the render's progress on the picture.
    vi.mocked(api.queueJob).mockResolvedValue([
      job({
        kind: 'render',
        frameIndex: 1,
        status: 'running',
        phase: 'image',
        progress: { step: 2, total: 4 },
      }),
    ])
    await wrapper.find('[data-render-button]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-jobs-line]').text()).toContain('Rendering… step 2 of 4')

    // A failed switch puts the select back, and says why.
    vi.mocked(api.setImageModel).mockRejectedValue(new Error('No Backend renders x'))
    await openMenu(wrapper, '[data-session-settings-button]')
    await select().setValue('mflux/qwen-image-2.1')
    await flushPromises()
    await openMenu(wrapper, '[data-session-settings-button]')
    expect((select().element as HTMLSelectElement).value).toBe('mflux/flux2-klein-4b')
    expect(wrapper.find('[data-frame-notice]').text()).toBe('No Backend renders x')
  })

  it('says which backend made a picture, which stays up to date when its model is picked on another', async () => {
    vi.mocked(api.getSettingsOptions).mockResolvedValue({
      features: ALL_AVAILABLE,
      imageModels: {
        ...IMAGE_MODELS,
        comfyui: [IMAGE_MODELS.mflux[0], {
          ...IMAGE_MODELS.mflux[0],
          id: 'moss-image',
          label: 'MOSS-Image',
        }],
      },
      imageBackends: ['mflux', 'comfyui'],
      // Settings send Qwen-Image 2.1 to the ComfyUI, though mflux has it too.
      imageModelsOn: {
        'qwen-image-2.1': 'comfyui',
        'flux2-klein-4b': 'mflux',
        'moss-image': 'comfyui',
      } as const,
    } as unknown as api.SettingsOptions)
    await loadSettingsOptions()
    const chain = session([
      frame(0, null),
      frame(1, 'Sit', {
        timings: { text: 3 },
        pictures: [{ image: 'frame-1.png', imageModel: 'qwen-image-2.1', imageBackend: 'mflux' }],
      }),
    ])
    vi.mocked(api.getSession).mockResolvedValue(chain)
    const { wrapper } = await mountIt()
    await openMenu(wrapper, '[data-session-settings-button]')
    const select = wrapper.find('[data-image-model]')
    // The Session hasn't picked a kind, so its model shows where Settings send it.
    expect((select.element as HTMLSelectElement).value).toBe('comfyui/qwen-image-2.1')
    // Its picture says where it was made.
    expect(wrapper.find('[data-picture-label]').text()).toBe('Frame 2 of 2')
    expect(wrapper.find('[data-timings]').text()).toBe(
      'Text 3.0 s by x · by Qwen-Image 2.1 · mflux',
    )

    // Picked on mflux, the Session keeps that kind; the same model's picture stays up to date.
    vi.mocked(api.setImageModel).mockResolvedValue({
      ...chain,
      settings: { ...chain.settings, imageBackend: 'mflux' },
    })
    await select.setValue('mflux/qwen-image-2.1')
    await flushPromises()
    expect(api.setImageModel).toHaveBeenCalledWith('s1', 'qwen-image-2.1', 'mflux')
    expect(wrapper.find('[data-picture-label]').text()).toBe('Frame 2 of 2')
    vi.mocked(api.getSettingsOptions).mockResolvedValue(
      {
        features: ALL_AVAILABLE,
        imageModels: IMAGE_MODELS,
        imageBackends: ['mflux'],
      } as api.SettingsOptions,
    )
    await loadSettingsOptions()
  })

  it('undoes the latest Frame and puts its Direction back in the text box', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null), frame(1, 'Sit down')]))
    vi.mocked(api.undoFrames).mockResolvedValue(session([frame(0, null)]))
    const { wrapper } = await mountIt()
    await wrapper.find('[data-undo-main]').trigger('click')
    await loadImages()
    expect(api.undoFrames).toHaveBeenCalledWith('s1', 1, 1)
    expect(tiles(wrapper)).toHaveLength(1)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Sit down')
    expect(wrapper.find('main img').attributes('src')).toContain('frame-0.png')
  })

  it('undoes back to an earlier Frame shown, once confirmed, putting the next Action back', async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([frame(0, null), frame(1, 'Sit'), frame(2, 'Stand'), frame(3, 'Kneel')]),
    )
    vi.mocked(api.undoFrames).mockResolvedValue(session([frame(0, null), frame(1, 'Sit')]))
    vi.mocked(ask).mockReset().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const { wrapper } = await mountIt()
    const undo = () => wrapper.find('[data-undo-main]')
    expect(undo().attributes('aria-label')).toBe('Undo')
    await tiles(wrapper)[1].trigger('click')
    expect(undo().attributes('aria-label')).toBe('Undo to Frame 2')
    await undo().trigger('click')
    await flushPromises()
    expect(vi.mocked(ask).mock.calls[0][0]).toContain('Undo Frames 3–4')
    expect(api.undoFrames).not.toHaveBeenCalled()
    await undo().trigger('click')
    await flushPromises()
    expect(api.undoFrames).toHaveBeenCalledWith('s1', 2, 3)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Stand')
    expect(undo().attributes('aria-label')).toBe('Undo')
  })

  it('keeps a half-typed Direction on Undo, offering the undone one beside it', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null), frame(1, 'Sit down')]))
    vi.mocked(api.undoFrames).mockResolvedValue(session([frame(0, null)]))
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('Kneel')
    await wrapper.find('[data-undo-main]').trigger('click')
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Kneel')
    // The undone Action is offered beside it, to swap in.
    expect(wrapper.find('[data-put-back]').text()).toContain("Frame 2's Action: Sit down")
    await wrapper.find('[data-put-back-use]').trigger('click')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Sit down')
    expect(wrapper.find('[data-put-back]').text()).toContain('Your draft: Kneel')
    await wrapper.find('[data-put-back-dismiss]').trigger('click')
    expect(wrapper.find('[data-put-back]').exists()).toBe(false)
  })

  it('offers Undo only after the Opening Frame', async () => {
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-undo-main]').attributes('disabled')).toBeDefined()

    vi.mocked(api.getSession).mockResolvedValue(
      session([frame(0, null), frame(1, 'Sit'), frame(2, 'Stand')]),
    )
    const { wrapper: longer } = await mountIt()
    expect(longer.find('[data-undo-main]').attributes('disabled')).toBeUndefined()
  })

  it('offers Delete on the Frames between the Opening and the latest, in the ⋯ menu', async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([frame(0, null), frame(1, 'Sit'), frame(2, 'Stand')]),
    )
    const { wrapper } = await mountIt()
    const offered = []
    for (const i of [0, 1, 2]) {
      await tiles(wrapper)[i].trigger('click')
      await openMenu(wrapper, '[data-more]')
      offered.push(wrapper.find('[data-delete-frame]').exists())
    }
    // The latest has Undo instead.
    expect(offered).toEqual([false, true, false])
  })

  it('deletes a Frame once confirmed, as it saw the Chain, and shows the one in its place', async () => {
    const made = '2026-09-24T00:00:01.000Z'
    vi.mocked(api.getSession).mockResolvedValue(
      session([frame(0, null), frame(1, 'Sit', { createdAt: made }), frame(2, 'Stand')]),
    )
    vi.mocked(api.deleteChainFrame).mockResolvedValue(
      session([frame(0, null), frame(1, 'Stand', { pictures: [picture('frame-2.png')] })]),
    )
    vi.mocked(ask).mockReset().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const { wrapper } = await mountIt()
    // Looking at the Frame to delete.
    await tiles(wrapper)[1].trigger('click')

    await openMenu(wrapper, '[data-more]')
    await wrapper.find('[data-delete-frame]').trigger('click')
    await flushPromises()
    expect(api.deleteChainFrame).not.toHaveBeenCalled()
    await openMenu(wrapper, '[data-more]')
    await wrapper.find('[data-delete-frame]').trigger('click')
    await flushPromises()
    expect(ask).toHaveBeenCalledTimes(2)
    expect(api.deleteChainFrame).toHaveBeenCalledWith('s1', 1, { frames: 3, createdAt: made })
    expect(tiles(wrapper)).toHaveLength(2)
    expect(wrapper.find('main img').attributes('src')).toContain('frame-2.png')
  })

  it('stops the clip playing when the Session switches Image Model', async () => {
    const clip = { kind: 'idle-loop', file: 'clip-0.mp4' } as api.Clip
    const chain = session([frame(0, null)])
    vi.mocked(api.getSession).mockResolvedValue(chain)
    const { wrapper } = await mountIt()
    await openMenu(wrapper, '[data-clip-menu-button]')
    // The clips open in the drawer beside the picture, not over it.
    expect(wrapper.find('[data-drawer]').attributes('data-drawer-tab')).toBe('clip')
    wrapper.findComponent(FrameClips).vm.$emit('play', clip)
    await flushPromises()
    expect(wrapper.find('[data-clip-overlay]').exists()).toBe(true)
    // Only the clip's own controls are on it while it plays.
    expect(wrapper.find('[data-picture-toolbar]').exists()).toBe(false)
    expect(wrapper.find('[data-open-prompt]').exists()).toBe(false)

    const switched = { ...chain, settings: { imageModel: 'krea-2' } as api.Settings }
    await openMenu(wrapper, '[data-session-settings-button]')
    wrapper.findComponent(ImageModelPicker).vm.$emit('switched', switched)
    await flushPromises()
    expect(wrapper.find('[data-clip-overlay]').exists()).toBe(false)
  })

  it('loads the Session and its jobs again when Pictures changed them', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null)]))
    const { wrapper } = await mountIt()
    vi.mocked(api.getSession).mockClear()
    vi.mocked(api.listJobs).mockClear()
    wrapper.findComponent(AllFrames).vm.$emit('changed')
    await flushPromises()
    expect(api.getSession).toHaveBeenCalledWith('s1')
    expect(api.listJobs).toHaveBeenCalledWith('s1')
  })

  it('edits a Frame’s Image Prompt by hand, its picture then changed since render', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null), frame(1, 'Sit')]))
    vi.mocked(api.saveChainPrompt).mockResolvedValue(
      session([
        frame(0, null),
        frame(1, 'Sit', {
          prompt: 'A garden at dawn.',
          pictures: [picture('frame-1.png', { stale: true })],
        }),
      ]),
    )
    const { wrapper } = await mountIt()
    await wrapper.find('[data-edit-prompt]').trigger('click')
    const box = wrapper.find('[data-prompt-editor] textarea')
    expect((box.element as HTMLTextAreaElement).value).toBe(promptFor(1))
    expect(wrapper.find('[data-show-removed]').exists()).toBe(false)
    await box.setValue('A garden at dawn.')
    await wrapper.find('[data-prompt-editor]').trigger('submit')
    await flushPromises()
    expect(api.saveChainPrompt).toHaveBeenCalledWith('s1', 1, 'A garden at dawn.')
    expect(wrapper.find('[data-prompt-editor]').exists()).toBe(false)
    // Shown as a diff against Frame 0 again, the new words marked.
    const added = wrapper.findAll('[data-prompt] [data-diff=added]').map((w) => w.text()).join(' ')
    expect(added).toBe('garden at dawn.')
    expect(wrapper.find('[data-picture-label]').text()).toContain('changed since render')
    expect(wrapper.find('[data-render-button]').text()).toBe('Re-render')
  })

  it('drops an edit of the prompt on Cancel, or on showing another Frame', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null), frame(1, 'Sit')]))
    const { wrapper } = await mountIt()
    await wrapper.find('[data-edit-prompt]').trigger('click')
    await buttonNamed(wrapper, 'Cancel').trigger('click')
    expect(wrapper.find('[data-prompt-editor]').exists()).toBe(false)
    await wrapper.find('[data-edit-prompt]').trigger('click')
    await tiles(wrapper)[0].trigger('click')
    expect(wrapper.find('[data-prompt-editor]').exists()).toBe(false)
    expect(api.saveChainPrompt).not.toHaveBeenCalled()
  })

  it('shows why an Undo was refused', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null), frame(1, 'Sit')]))
    vi.mocked(api.undoFrames).mockRejectedValue(
      new api.ApiError('Frame 1 is not the latest Frame', 409),
    )
    const { wrapper } = await mountIt()
    await wrapper.find('[data-undo-main]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role=alert]').text()).toBe('Frame 1 is not the latest Frame')
  })

  it('shows when its Frame waits for a render on the Text Model’s machine', async () => {
    let emit!: (e: api.FrameEvent) => void
    vi.mocked(api.streamFrame).mockImplementation((_id, _action, onEvent) => {
      emit = onEvent
      return new Promise(() => {})
    })
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('Sit')
    await buttonNamed(wrapper, 'Send').trigger('click')
    emit({ type: 'phase', phase: 'queued' })
    await flushPromises()
    expect(wrapper.find('[role=status]').text()).toContain('Waiting for another render')
    expect(wrapper.find('[data-rendering]').exists()).toBe(false)
  })

  it('remembers an unsent Direction per Session', async () => {
    localStorage.setItem('draft:s1', 'Kneel on one knee')
    const { wrapper } = await mountIt()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe(
      'Kneel on one knee',
    )
    await wrapper.find('textarea').setValue('Stand up')
    expect(localStorage.getItem('draft:s1')).toBe('Stand up')
    await wrapper.find('textarea').setValue('')
    expect(localStorage.getItem('draft:s1')).toBeNull()
  })

  it('says when an earlier Frame is shown, and returns to the latest', async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([
        frame(0, null),
        frame(1, 'Sit'),
        frame(2, 'Stand'),
        frame(3, 'Kneel'),
        frame(4, 'Wave'),
      ]),
    )
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-viewing]').exists()).toBe(false)

    await wrapper.find('textarea').setValue('my draft')

    await tiles(wrapper)[1].trigger('click')
    await loadImages()
    expect(wrapper.find('[data-picture-label]').text()).toBe('Frame 2 of 5')
    expect(wrapper.find('[data-viewing]').text()).toBe('Back to the latest')
    // Its Action is beside the picture; the box can't send from here.
    expect(wrapper.find('[data-action]').text()).toBe('Sit')
    const box = wrapper.find('textarea')
    expect(box.attributes('placeholder')).toBe(
      'Viewing Frame 2: go back to the latest to change it',
    )
    expect(box.attributes('disabled')).toBeDefined()
    expect(buttonNamed(wrapper, 'Send').attributes('disabled')).toBeDefined()

    await tiles(wrapper)[0].trigger('click')
    expect(wrapper.find('textarea').attributes('placeholder')).toContain('Viewing the Opening')

    await wrapper.find('[data-viewing]').trigger('click')
    await loadImages()
    expect(wrapper.find('[data-viewing]').exists()).toBe(false)
    expect(wrapper.find('main img').attributes('src')).toContain('frame-4.png')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('my draft')
    expect(buttonNamed(wrapper, 'Send').attributes('disabled')).toBeUndefined()
  })

  it('streams the thinking beside the picture until the Narration arrives', async () => {
    let emit!: (e: api.FrameEvent) => void
    vi.mocked(api.streamFrame).mockImplementation((_id, _action, onEvent) => {
      emit = onEvent
      return new Promise(() => {})
    })
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('Sit')
    await buttonNamed(wrapper, 'Send').trigger('click')
    emit({ type: 'thinking', text: 'She could sit ' })
    emit({ type: 'thinking', text: 'on the stool.' })
    await flushPromises()
    expect(wrapper.find('[data-thinking]').text()).toContain('She could sit on the stool.')
    expect(wrapper.find('[data-caption]').exists()).toBe(false)

    emit({ type: 'thinking', text: 'Fresh try.', restart: true })
    await flushPromises()
    expect(wrapper.find('[data-thinking]').text()).not.toContain('stool')

    emit({ type: 'committed', frame: frame(1, 'Sit', { narration: 'Kael sits.' }) })
    await flushPromises()
    expect(wrapper.find('[data-thinking]').exists()).toBe(false)
    expect(wrapper.find('[data-caption]').text()).toBe('Kael sits.')
  })

  it("shows a Frame's saved thinking with its prompt", async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([frame(0, null), frame(1, 'Sit', { thinking: 'The stool is free.' })]),
    )
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-frame-thinking]').text()).toBe('The stool is free.')
    // The Opening had no thinking.
    await tiles(wrapper)[0].trigger('click')
    expect(wrapper.find('[data-frame-thinking]').exists()).toBe(false)
  })

  it('asks before a reload or leaving the site while its Frame runs', async () => {
    const leaving = () => {
      const e = new Event('beforeunload', { cancelable: true })
      globalThis.dispatchEvent(e)
      return e.defaultPrevented
    }
    let finish!: () => void
    vi.mocked(api.streamFrame).mockImplementation(() => new Promise((r) => (finish = r)))
    const { wrapper } = await mountIt()
    expect(leaving()).toBe(false)

    await wrapper.find('textarea').setValue('Sit')
    await buttonNamed(wrapper, 'Send').trigger('click')
    expect(leaving()).toBe(true)

    finish()
    await flushPromises()
    expect(leaving()).toBe(false)
  })

  it('renders a Frame made without its picture on request, and switches rendering in this browser', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null, { pictures: [] })]))
    vi.mocked(api.queueJob).mockResolvedValue([job({ kind: 'render' })])
    vi.mocked(api.streamFrame).mockImplementation(() => Promise.resolve())
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-empty]').text()).toBe("Frame 1 isn't rendered")
    // Nothing to upscale or make 3D of yet; Render it queues the picture.
    expect(wrapper.find('[data-upscale-button]').exists()).toBe(false)
    await wrapper.find('[data-render-it]').trigger('click')
    await flushPromises()
    expect(api.queueJob).toHaveBeenCalledWith('s1', 'render', 0)

    // On unless this browser switched it off; sent with each Action.
    await openMenu(wrapper, '[data-session-settings-button]')
    const box = wrapper.find('[data-render-frames] input')
    expect((box.element as HTMLInputElement).checked).toBe(true)
    await box.setValue(false)
    expect(localStorage.getItem('chain-render-frames')).toBe('0')
    await wrapper.find('textarea').setValue('Sit down')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    expect(api.streamFrame).toHaveBeenCalledWith('s1', 'Sit down', expect.any(Function), false)
    localStorage.removeItem('chain-render-frames')
  })

  it('queues a render of every Frame with no picture by its Image Model', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([
      frame(0, null),
      frame(1, 'Sit', { pictures: [] }),
      // By another Image Model than the Chain's.
      frame(2, 'Stand', { pictures: [picture('frame-2.png', { imageModel: 'flux2-klein-4b' })] }),
    ]))
    const queued: api.Job[] = []
    vi.mocked(api.queueJob).mockImplementation((_id, kind, frameIndex) => {
      queued.push(job({ id: `j${frameIndex}`, kind, frameIndex }))
      return Promise.resolve([...queued])
    })
    const { wrapper } = await mountIt()
    // In the text box's ⋯ menu, with how many it would render.
    await openMenu(wrapper, '[data-more]')
    expect(wrapper.find('[data-render-all] [data-render-count]').text()).toBe('2')
    await wrapper.find('[data-render-all]').trigger('click')
    await flushPromises()
    expect(vi.mocked(api.queueJob).mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ['render', 1],
      ['render', 2],
    ])
    // All queued: nothing left to add.
    await openMenu(wrapper, '[data-more]')
    expect(wrapper.find('[data-render-all]').attributes('disabled')).toBeDefined()
  })

  it('queues an upscale of the shown Frame, then shows the upscaled image', async () => {
    vi.useFakeTimers()
    vi.mocked(api.queueJob).mockResolvedValue([
      job({ status: 'running', phase: 'image', progress: { step: 1, total: 1 } }),
    ])
    const { wrapper } = await mountIt()
    await wrapper.find('[data-upscale-button]').trigger('click')
    await flushPromises()
    expect(api.queueJob).toHaveBeenCalledWith('s1', 'upscale', 0)
    expect(wrapper.find('[data-jobs-line]').text()).toContain('Upscaling to 2048 px… step 1 of 1')
    expect(wrapper.find('[data-picture]').classes()).toContain('render-sweep')

    vi.mocked(api.getSession).mockResolvedValue(
      session([
        frame(0, null, { pictures: [picture('frame-0.png', { upscaled: 'frame-0-2048.png' })] }),
      ]),
    )
    // The queue is checked every second; the job is gone, so the Chain is reloaded.
    await vi.advanceTimersByTimeAsync(1100)
    await flushPromises()
    await loadImages()
    expect(wrapper.find('main img').attributes('src')).toBe(
      '/api/sessions/s1/images/frame-0-2048.png',
    )
    const button = wrapper.find('[data-upscale-button]')
    expect([button.text(), button.attributes('disabled')]).toEqual(['Upscaled', ''])
  })

  it("shows the picture's pixel size on its label", async () => {
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-size]').exists()).toBe(false)
    const img = wrapper.find('main img')
    Object.defineProperty(img.element, 'naturalWidth', { value: 768 })
    Object.defineProperty(img.element, 'naturalHeight', { value: 512 })
    await img.trigger('load')
    expect(wrapper.find('[data-size]').text()).toBe('· 768×512')
  })
})
