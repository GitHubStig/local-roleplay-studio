import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '../api'
import { ALL_AVAILABLE, ALL_ON, promptFor } from '../testing'
import { useFeatures } from '../composables/useFeatures'
import SessionView from './SessionView.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSession: vi.fn(),
  streamFrame: vi.fn(),
  cancelFrame: vi.fn(),
  endSession: vi.fn(),
  createSession: vi.fn(),
  undoFrame: vi.fn(),
  getSettings: vi.fn(),
  getSettingsOptions: vi.fn(),
  listJobs: vi.fn(),
  queueJob: vi.fn(),
  cancelJob: vi.fn(),
  retryJob: vi.fn(),
  setRenderFrames: vi.fn(),
}))

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
  image: `frame-${index}.png`,
  createdAt: '2026-09-24T00:00:00.000Z',
  ...extra,
})

const job = (extra: Partial<api.Job>): api.Job => ({
  id: 'j1',
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
  settings: {} as api.Settings,
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
  const wrapper = mount(SessionView, { props: { id: 's1' }, global: { plugins: [router] } })
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

const buttonNamed = (wrapper: Awaited<ReturnType<typeof mountIt>>['wrapper'], name: string) =>
  wrapper.findAll('button').find((b) => b.text() === name)!

beforeEach(() => {
  localStorage.clear()
  preloads.length = 0
  vi.stubGlobal('Image', FakeImage)
  vi.mocked(api.streamFrame).mockReset()
  vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null)]))
  vi.mocked(api.listJobs).mockReset().mockResolvedValue([])
  vi.mocked(api.queueJob).mockReset()
})

afterEach(() => vi.unstubAllGlobals())
// Unmounted screens would leave window listeners (e.g. "Leave site?") behind for later tests.
enableAutoUnmount(afterEach)

describe('SessionView', () => {
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

    emit({ type: 'text', narration: 'Kael looks up.', outcome: 'done', prompt: promptFor(0) })
    emit({ type: 'phase', phase: 'image' })
    emit({ type: 'progress', step: 2, total: 4 })
    await flushPromises()
    expect(wrapper.find('[data-provisional]').text()).toBe('Kael looks up.')
    expect(wrapper.find('[role=status]').text()).toContain('Rendering the image… step 2 of 4')
    expect(wrapper.find('[data-rendering]').attributes('data-rendering')).toBe('image')
    expect(wrapper.find('[data-writing]').exists()).toBe(false)

    emit({ type: 'committed', frame: frame(0, null, { narration: 'Kael looks up.' }) })
    finish()
    await loadImages()
    expect(wrapper.find('[data-provisional]').exists()).toBe(false)
    expect(wrapper.find('.render-sweep').exists()).toBe(false)
    expect(wrapper.find('[data-writing]').exists()).toBe(false)
    expect(wrapper.find('img').attributes('src')).toBe('/api/sessions/s1/images/frame-0.png')
  })

  it('sends the Direction on Enter and clears it once committed', async () => {
    vi.mocked(api.streamFrame).mockImplementation(async (_id, _action, onEvent) => {
      onEvent({ type: 'committed', frame: frame(1, 'Sit down') })
    })
    const { wrapper } = await mountIt()
    const textarea = wrapper.find('textarea')
    await textarea.setValue('Sit down')
    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(api.streamFrame).toHaveBeenCalledWith('s1', 'Sit down', expect.any(Function))
    expect((textarea.element as HTMLTextAreaElement).value).toBe('')
    expect(wrapper.findAll('aside li')).toHaveLength(2)
  })

  it('makes no Frame for an unclear Action: it stays in the box, with the question in blue', async () => {
    vi.mocked(api.streamFrame).mockImplementationOnce(async (_id, _action, onEvent) => {
      onEvent({ type: 'unclear', message: 'Which backdrop do you mean?' })
    })
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('make it weird')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('make it weird')
    expect(wrapper.findAll('aside li')).toHaveLength(1)
    const notice = wrapper.find('[data-frame-notice]')
    expect([notice.text(), notice.classes()]).toEqual([
      'Which backdrop do you mean?',
      expect.arrayContaining(['text-info']),
    ])
  })

  it('makes no Frame for an Action that changed nothing in the picture, saying so in blue', async () => {
    vi.mocked(api.streamFrame).mockImplementationOnce(async (_id, _action, onEvent) => {
      onEvent({ type: 'unchanged', message: 'Nothing in the picture changed.' })
    })
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('wait a moment')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('wait a moment')
    expect(wrapper.findAll('aside li')).toHaveLength(1)
    const notice = wrapper.find('[data-frame-notice]')
    expect([notice.text(), notice.classes()]).toEqual([
      'Nothing in the picture changed.',
      expect.arrayContaining(['text-info']),
    ])
  })

  it('makes no Frame for a declined Action: it stays in the box, with the reason beside it', async () => {
    vi.mocked(api.streamFrame).mockImplementationOnce(async (_id, _action, onEvent) => {
      onEvent({ type: 'phase', phase: 'text' })
      onEvent({ type: 'declined', message: 'Declined: no sexual or nude imagery.' })
    })
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('make her topless')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('make her topless')
    expect(wrapper.findAll('aside li')).toHaveLength(1)
    const notice = wrapper.find('[data-frame-notice]')
    expect([notice.text(), notice.classes()]).toEqual([
      'Declined: no sexual or nude imagery.',
      expect.arrayContaining(['text-warn']),
    ])
    // Sending again clears it.
    vi.mocked(api.streamFrame).mockImplementationOnce(async (_id, _action, onEvent) => {
      onEvent({ type: 'committed', frame: frame(1, 'sit down') })
    })
    await wrapper.find('textarea').setValue('sit down')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-frame-notice]').text()).toBe('')
  })

  it('keeps the Direction and shows the error when a Frame fails', async () => {
    vi.mocked(api.streamFrame).mockImplementation(async (_id, _action, onEvent) => {
      onEvent({ type: 'failed', message: 'mflux crashed', sessionDiscarded: false })
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
    vi.mocked(api.streamFrame).mockImplementation(async (_id, _action, onEvent) => {
      onEvent({ type: 'failed', message: 'Ollama: model not found', sessionDiscarded: true })
    })
    const { router } = await mountIt()
    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.query.error).toBe('Ollama: model not found')
  })

  it('puts a new Frame in the Frames at once, shown blank until its picture forms', async () => {
    let send!: (event: api.FrameEvent) => void
    vi.mocked(api.getSession).mockResolvedValue({
      ...session([frame(0, null)]),
      settings: { imageBackend: 'comfyui' } as api.Settings,
    })
    vi.mocked(api.streamFrame).mockImplementation((_id, _action, onEvent) => {
      send = onEvent
      return new Promise(() => {})
    })
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('Sit down')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    const entry = wrapper.find('[data-pending-frame]')
    expect(entry.text()).toContain('Sit down')
    expect(entry.attributes('aria-current')).toBe('true')
    // The Opening's picture is gone from the main panel: the new Frame has none yet.
    expect(wrapper.find('main [data-frame-picture]').exists()).toBe(false)

    send({ type: 'phase', phase: 'image' })
    send({ type: 'progress', step: 3, total: 25 })
    await flushPromises()
    await loadImages()
    const preview = wrapper.find('main [data-preview]')
    expect(preview.attributes('src')).toBe('/api/sessions/s1/preview?step=3')
    // Alone in its frame, it shows at full strength.
    expect(preview.attributes('style')).toContain('opacity: 1')

    // An earlier Frame can be looked at meanwhile, without the preview, and the new one picked again.
    await wrapper.findAll('aside [data-frame]')[0].trigger('click')
    await loadImages()
    expect(wrapper.find('main [data-frame-picture]').attributes('src')).toContain('frame-0.png')
    expect(wrapper.find('[data-pending-frame]').attributes('aria-current')).toBe('false')
    await wrapper.find('[data-pending-frame]').trigger('click')
    expect(wrapper.find('[data-pending-frame]').attributes('aria-current')).toBe('true')
  })

  it('shows an earlier Frame when picked from the Frames', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null), frame(1, 'Sit')]))
    const { wrapper } = await mountIt()
    expect(wrapper.find('main img').attributes('src')).toContain('frame-1.png')
    await wrapper.findAll('aside [data-frame]')[0].trigger('click')
    // The old image stays until the new one has loaded, then crossfades.
    expect(wrapper.find('main img').attributes('src')).toContain('frame-1.png')
    await loadImages()
    expect(wrapper.find('main img').attributes('src')).toContain('frame-0.png')
  })

  it('shows the Narration as a caption over the image, which can be hidden', async () => {
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-caption]').text()).toBe('Narration 0.')
    await wrapper.findAll('main button').find((b) => b.text() === 'Hide')!.trigger('click')
    expect(wrapper.find('[data-caption]').exists()).toBe(false)
    expect(localStorage.getItem('caption-hidden')).toBe('1')
    await wrapper.findAll('main button').find((b) => b.text() === 'Show caption')!.trigger('click')
    expect(wrapper.find('[data-caption]').exists()).toBe(true)
  })

  it("shows the viewed Frame's Image Prompt as a word diff against the Frame before", async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([
        frame(0, null),
        frame(1, 'Sit', { prompt: promptFor(1).replace('calm', 'scared') }),
      ]),
    )
    const { wrapper } = await mountIt()
    await wrapper.findAll('[role=tab]')[1].trigger('click')
    const panel = wrapper.find('[data-prompt-panel]')
    expect(panel.text()).toContain('Frame 1 · Sit')
    expect(panel.findAll('[data-diff=removed]').map((d) => d.text())).toEqual(['0, calm,'])
    expect(panel.findAll('[data-diff=added]').map((d) => d.text())).toEqual(['1, scared,'])
    expect(panel.text()).toContain('since Frame 0')
  })

  it('can hide the removed words, remembering the choice', async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([
        frame(0, null),
        frame(1, 'Sit', { prompt: promptFor(1).replace('calm', 'scared') }),
      ]),
    )
    const { wrapper } = await mountIt()
    await wrapper.findAll('[role=tab]')[1].trigger('click')
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
        frame(0, null, { timings: { text: 9.8, queued: 12.3, image: 5.1 } }),
        frame(1, 'Stay', { image: null, timings: { text: 3, image: null } }),
      ]),
    )
    const { wrapper } = await mountIt()
    await wrapper.findAll('[role=tab]')[1].trigger('click')
    // Not rendered yet.
    expect(wrapper.find('[data-timings]').text()).toBe('Text 3.0 s')
    await wrapper.findAll('[role=tab]')[0].trigger('click')
    await wrapper.findAll('aside [data-frame]')[0].trigger('click')
    await wrapper.findAll('[role=tab]')[1].trigger('click')
    expect(wrapper.find('[data-timings]').text()).toBe('Text 9.8 s · Waited 12.3 s · Image 5.1 s')
  })

  it('shows no timings for Frames saved before they were recorded', async () => {
    const { wrapper } = await mountIt()
    await wrapper.findAll('[role=tab]')[1].trigger('click')
    expect(wrapper.find('[data-timings]').exists()).toBe(false)
  })

  it('shows Frames and Prompt together on wide windows, as tabs on narrow ones', async () => {
    const { wrapper } = await mountIt()
    const log = () => wrapper.find('[data-log-panel]').classes()
    const prompt = () => wrapper.find('[data-prompt-panel]').classes()
    // Both are always in the page; below xl only the selected tab's panel is displayed.
    expect(log()).toContain('flex')
    expect(prompt()).toEqual(expect.arrayContaining(['hidden', 'xl:flex']))
    await wrapper.findAll('[role=tab]')[1].trigger('click')
    expect(log()).toEqual(expect.arrayContaining(['hidden', 'xl:flex']))
    expect(prompt()).toContain('flex')
    expect(wrapper.find('[role=tablist]').classes()).toContain('xl:hidden')
  })

  it('shows the Opening prompt without any diff', async () => {
    const { wrapper } = await mountIt()
    await wrapper.findAll('[role=tab]')[1].trigger('click')
    expect(wrapper.findAll('[data-diff=added], [data-diff=removed]')).toHaveLength(0)
    expect(wrapper.find('[data-prompt]').text()).toBe(promptFor(0))
  })

  it('labels declined and unclear Frames in the caption and the Frames', async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([
        frame(0, null),
        frame(1, 'Take the jacket off', { outcome: 'declined' }),
        frame(2, 'asdf qwer', { outcome: 'unclear' }),
      ]),
    )
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-outcome]').text()).toBe("Didn't understand")
    const log = wrapper.find('aside').text()
    expect(log).toContain('Declined')
    expect(log).toContain("Didn't understand")
    await wrapper.findAll('aside [data-frame]')[0].trigger('click')
    expect(wrapper.find('[data-outcome]').exists()).toBe(false)
  })

  it("shapes the frame to the Session's picture size before the first picture arrives", async () => {
    vi.mocked(api.getSession).mockResolvedValue({
      ...session(),
      imageSize: { width: 1024, height: 1024 },
    })
    vi.mocked(api.streamFrame).mockImplementation(() => new Promise(() => {}))
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-image-frame]').attributes('data-aspect')).toBe('1.000')
  })

  it('opens the picture in the viewer when clicked, stepping through the Frames', async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([frame(0, null), frame(1, 'Sit', { upscaled: 'frame-1-2048.png' })]),
    )
    const { wrapper } = await mountIt()
    // The stage doesn't zoom; the viewer does.
    expect(wrapper.find('main [data-zoom-layer]').attributes('style') ?? '').not.toContain('scale')
    await wrapper.find('main [data-frame-picture]').trigger('click')
    await flushPromises()
    const viewer = () => wrapper.find('[data-image-viewer]')
    expect(viewer().find('[data-viewer-label]').text()).toBe('Frame 1 · 2 of 2')
    expect(viewer().find('[data-image-frame] img').attributes('src')).toContain('frame-1-2048.png')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await flushPromises()
    await flushPromises()
    expect(viewer().find('[data-viewer-label]').text()).toBe('The Opening · 1 of 2')
  })

  it('queues SHARP, TripoSplat and LiTo on the shown Frame, then offers to view what was made', async () => {
    vi.mocked(api.queueJob).mockImplementation(async (_id, kind, frameIndex) => [
      job({ kind, frameIndex, status: 'running', phase: 'image' }),
    ])
    const { wrapper } = await mountIt()
    await wrapper.find('[data-lito-button]').trigger('click')
    await flushPromises()
    expect(api.queueJob).toHaveBeenCalledWith('s1', 'lito', 0)
    // It runs beside the Chain: the button waits, the queue shows it, and the next Action can go.
    expect(wrapper.find('[data-lito-button]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('main [data-frame-job]').exists()).toBe(false)
    expect(wrapper.find('[data-queue]').text()).toContain('LiTo · The Opening')
    expect(wrapper.find('[data-queue]').text()).toContain('Making the 3D figure…')
    expect(wrapper.find('textarea').attributes('disabled')).toBeUndefined()

    // Once done, the Chain is reloaded with the figure on it.
    const figure: api.Figure = {
      file: 'lito-0-1a2b3c4d.ply',
      splats: 4,
      from: 'frame-0.png',
      timings: { figure: 90 },
    }
    vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null, { lito: figure })]))
    // The queue is checked every second; the job is gone, so the Chain is reloaded.
    await new Promise((r) => setTimeout(r, 1100))
    await flushPromises()
    expect(wrapper.find('[data-view-lito]').exists()).toBe(true)
    expect(wrapper.find('[data-figure-button]').exists()).toBe(true)
  })

  it('hides Upscale and the 3D buttons whose Features are off', async () => {
    vi.mocked(api.getSettingsOptions).mockResolvedValue(
      { features: ALL_AVAILABLE } as api.SettingsOptions,
    )
    vi.mocked(api.getSettings).mockResolvedValue({
      features: { ...ALL_ON, images: false, lito: false },
    } as api.Settings)
    await useFeatures().refreshFeatures()
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-upscale-button]').exists()).toBe(false)
    expect(wrapper.find('[data-lito-button]').exists()).toBe(false)
    expect(wrapper.find('[data-scene-button]').exists()).toBe(true)
    vi.mocked(api.getSettings).mockResolvedValue({ features: ALL_ON } as api.Settings)
    await useFeatures().refreshFeatures()
  })

  it('offers SHARP again once the Frame is upscaled after its scene was made', async () => {
    const scene: api.Scene = {
      file: 'scene-0-1a2b3c4d.ply',
      from: 'frame-0.png',
      splats: 4,
      pivot: 1.5,
      fov: 50,
      aspect: 1,
      timings: { scene: 11 },
    }
    vi.mocked(api.getSession).mockResolvedValue(
      session([frame(0, null, { scene, upscaled: 'frame-0-2048.png' })]),
    )
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-scene-button]').text()).toBe('SHARP again from upscale')
  })

  it('undoes the latest Frame and puts its Direction back in the text box', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null), frame(1, 'Sit down')]))
    vi.mocked(api.undoFrame).mockResolvedValue(session([frame(0, null)]))
    const { wrapper } = await mountIt()
    await buttonNamed(wrapper, 'Undo').trigger('click')
    await loadImages()
    expect(api.undoFrame).toHaveBeenCalledWith('s1', 1)
    expect(wrapper.findAll('aside [data-frame]')).toHaveLength(1)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Sit down')
    expect(wrapper.find('main img').attributes('src')).toContain('frame-0.png')
  })

  it('keeps a half-typed Direction instead of overwriting it on Undo', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null), frame(1, 'Sit down')]))
    vi.mocked(api.undoFrame).mockResolvedValue(session([frame(0, null)]))
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('Kneel')
    await wrapper.find('[data-undo]').trigger('click')
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Kneel')
  })

  it('offers Undo only after the Opening Frame, on the latest Frame', async () => {
    const { wrapper } = await mountIt()
    expect(buttonNamed(wrapper, 'Undo').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-undo]').exists()).toBe(false)

    vi.mocked(api.getSession).mockResolvedValue(
      session([frame(0, null), frame(1, 'Sit'), frame(2, 'Stand')]),
    )
    const { wrapper: longer } = await mountIt()
    expect(buttonNamed(longer, 'Undo').attributes('disabled')).toBeUndefined()
    expect(longer.findAll('[data-undo]')).toHaveLength(1)
    expect(longer.findAll('aside li')[2].find('[data-undo]').exists()).toBe(true)
  })

  it('shows why an Undo was refused', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([frame(0, null), frame(1, 'Sit')]))
    vi.mocked(api.undoFrame).mockRejectedValue(
      new api.ApiError('Frame 1 is not the latest Frame', 409),
    )
    const { wrapper } = await mountIt()
    await buttonNamed(wrapper, 'Undo').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role=alert]').text()).toBe('Frame 1 is not the latest Frame')
  })

  it('shows when its render is waiting for another Session', async () => {
    let emit!: (e: api.FrameEvent) => void
    vi.mocked(api.streamFrame).mockImplementation((_id, _action, onEvent) => {
      emit = onEvent
      return new Promise(() => {})
    })
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('Sit')
    await buttonNamed(wrapper, 'Send').trigger('click')
    emit({ type: 'text', outcome: 'done', narration: 'Kael sits.', prompt: promptFor(0) })
    emit({ type: 'phase', phase: 'queued' })
    await flushPromises()
    expect(wrapper.find('[role=status]').text()).toContain('Waiting for another render')
    expect(wrapper.find('[data-rendering]').attributes('data-rendering')).toBe('queued')
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

    await wrapper.findAll('aside [data-frame]')[1].trigger('click')
    expect(wrapper.find('[data-viewing]').text()).toContain('Viewing Frame 1 of 4')
    const past = wrapper.find('[data-past-action]')
    expect((past.element as HTMLTextAreaElement).value).toBe('Sit')
    expect(past.attributes('readonly')).toBeDefined()
    expect(buttonNamed(wrapper, 'Send').attributes('disabled')).toBeDefined()
    // Enter in the read-only box must not send the hidden draft.
    await past.trigger('keydown', { key: 'Enter' })
    expect(api.streamFrame).not.toHaveBeenCalled()

    await wrapper.findAll('aside [data-frame]')[0].trigger('click')
    expect(wrapper.find('[data-viewing]').text()).toContain('Viewing the Opening of 4')
    expect((wrapper.find('[data-past-action]').element as HTMLTextAreaElement).value).toBe('')
    expect(wrapper.find('[data-past-action]').attributes('placeholder')).toBe(
      'The Opening Frame has no Action.',
    )

    await buttonNamed(wrapper, 'Back to latest').trigger('click')
    await loadImages()
    expect(wrapper.find('[data-viewing]').exists()).toBe(false)
    expect(wrapper.find('main img').attributes('src')).toContain('frame-4.png')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('my draft')
    expect(buttonNamed(wrapper, 'Send').attributes('disabled')).toBeUndefined()
  })

  it('streams the thinking in the caption area until the Narration arrives', async () => {
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

    emit({ type: 'text', outcome: 'done', narration: 'Kael sits.', prompt: promptFor(0) })
    await flushPromises()
    expect(wrapper.find('[data-thinking]').exists()).toBe(false)
    expect(wrapper.find('[data-caption]').text()).toBe('Kael sits.')
  })

  it("shows a Frame's saved thinking in the Prompt tab", async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([frame(0, null), frame(1, 'Sit', { thinking: 'The stool is free.' })]),
    )
    const { wrapper } = await mountIt()
    await wrapper.findAll('[role=tab]')[1].trigger('click')
    expect(wrapper.find('[data-frame-thinking]').text()).toBe('The stool is free.')
    // The Opening had no thinking.
    await wrapper.findAll('[role=tab]')[0].trigger('click')
    await wrapper.findAll('aside [data-frame]')[0].trigger('click')
    await wrapper.findAll('[role=tab]')[1].trigger('click')
    expect(wrapper.find('[data-frame-thinking]').exists()).toBe(false)
  })

  it('asks before a reload or leaving the site while its Frame runs', async () => {
    const leaving = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
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

  it('renders a Frame made without its picture on request, and switches rendering', async () => {
    vi.mocked(api.getSession).mockResolvedValue({
      ...session([frame(0, null, { image: null })]),
      renderFrames: false,
    })
    vi.mocked(api.queueJob).mockResolvedValue([job({ kind: 'render' })])
    vi.mocked(api.setRenderFrames).mockImplementation(async (_id, on) => ({
      ...session([frame(0, null, { image: null })]),
      renderFrames: on,
    }))
    const { wrapper } = await mountIt()
    expect(wrapper.find('main').text()).toContain('Not rendered yet')
    // Nothing to upscale or make 3D of yet; Render queues the picture.
    expect(wrapper.find('[data-upscale-button]').exists()).toBe(false)
    await wrapper.find('[data-render-button]').trigger('click')
    await flushPromises()
    expect(api.queueJob).toHaveBeenCalledWith('s1', 'render', 0)

    const box = wrapper.find('[data-render-frames]')
    expect((box.element as HTMLInputElement).checked).toBe(false)
    await box.setValue(true)
    await flushPromises()
    expect(api.setRenderFrames).toHaveBeenCalledWith('s1', true)
    expect((wrapper.find('[data-render-frames]').element as HTMLInputElement).checked).toBe(true)
  })

  it('queues an upscale of the shown Frame, then shows the upscaled image', async () => {
    vi.mocked(api.queueJob).mockResolvedValue([
      job({ status: 'running', phase: 'image', progress: { step: 1, total: 1 } }),
    ])
    const { wrapper } = await mountIt()
    await wrapper.find('[data-upscale-button]').trigger('click')
    await flushPromises()
    expect(api.queueJob).toHaveBeenCalledWith('s1', 'upscale', 0)
    expect(wrapper.find('[data-queue]').text()).toContain('Upscaling to 2048 px… step 1 of 1')
    expect(wrapper.find('[data-image-frame]').attributes('data-rendering')).toBe('image')

    vi.mocked(api.getSession).mockResolvedValue(
      session([frame(0, null, { upscaled: 'frame-0-2048.png' })]),
    )
    // The queue is checked every second; the job is gone, so the Chain is reloaded.
    await new Promise((r) => setTimeout(r, 1100))
    await flushPromises()
    await loadImages()
    expect(wrapper.find('main img').attributes('src')).toBe(
      '/api/sessions/s1/images/frame-0-2048.png',
    )
    const button = wrapper.find('[data-upscale-button]')
    expect([button.text(), button.attributes('disabled')]).toEqual(['Upscaled', ''])
  })

  it('shows the pixel size of the image on screen in a chip', async () => {
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-size]').exists()).toBe(false)
    const img = wrapper.find('main img')
    Object.defineProperty(img.element, 'naturalWidth', { value: 768 })
    Object.defineProperty(img.element, 'naturalHeight', { value: 512 })
    await img.trigger('load')
    expect(wrapper.find('[data-size]').text()).toBe('768×512')
  })
})
