import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '../api'
import { promptFor } from '../testing'
import SessionView from './SessionView.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSession: vi.fn(),
  streamTurn: vi.fn(),
  cancelTurn: vi.fn(),
  endSession: vi.fn(),
  createSession: vi.fn(),
  undoTurn: vi.fn(),
}))

const turn = (index: number, action: string | null, extra: Partial<api.Turn> = {}): api.Turn => ({
  index,
  action,
  prompt: promptFor(index),
  narration: `Narration ${index}.`,
  outcome: 'done',
  promptText: `prompt ${index}`,
  image: `turn-${index}.png`,
  createdAt: '2026-09-24T00:00:00.000Z',
  ...extra,
})

const session = (turns: api.Turn[] = []): api.Session => ({
  id: 's1',
  scenarioId: 'photoshoot',
  settings: {} as api.Settings,
  seed: 1,
  createdAt: '2026-09-24T00:00:00.000Z',
  turns,
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
  vi.mocked(api.streamTurn).mockReset()
  vi.mocked(api.getSession).mockResolvedValue(session([turn(0, null)]))
})

afterEach(() => vi.unstubAllGlobals())
// Unmounted screens would leave window listeners (e.g. "Leave site?") behind for later tests.
enableAutoUnmount(afterEach)

describe('SessionView', () => {
  it('runs the Opening Turn for a new Session, showing provisional text first', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session())
    let emit!: (e: api.TurnEvent) => void
    let finish!: () => void
    vi.mocked(api.streamTurn).mockImplementation((_id, action, onEvent) => {
      expect(action).toBeNull()
      emit = onEvent
      return new Promise((r) => (finish = r))
    })
    const { wrapper } = await mountIt()

    await flushPromises()
    expect(wrapper.find('[data-writing]').exists()).toBe(true)
    expect(wrapper.find('[data-rendering]').exists()).toBe(false)

    emit({ type: 'text', narration: 'Maya arrives.', outcome: 'done', prompt: promptFor(0) })
    emit({ type: 'phase', phase: 'image' })
    emit({ type: 'progress', step: 2, total: 4 })
    await flushPromises()
    expect(wrapper.find('[data-provisional]').text()).toBe('Maya arrives.')
    expect(wrapper.find('[role=status]').text()).toContain('Rendering the image… step 2 of 4')
    expect(wrapper.find('[data-rendering]').attributes('data-rendering')).toBe('image')
    expect(wrapper.find('[data-writing]').exists()).toBe(false)

    emit({ type: 'committed', turn: turn(0, null, { narration: 'Maya arrives.' }) })
    finish()
    await loadImages()
    expect(wrapper.find('[data-provisional]').exists()).toBe(false)
    expect(wrapper.find('.render-sweep').exists()).toBe(false)
    expect(wrapper.find('[data-writing]').exists()).toBe(false)
    expect(wrapper.find('img').attributes('src')).toBe('/api/sessions/s1/images/turn-0.png')
  })

  it('sends the Direction on Enter and clears it once committed', async () => {
    vi.mocked(api.streamTurn).mockImplementation(async (_id, _action, onEvent) => {
      onEvent({ type: 'committed', turn: turn(1, 'Sit down') })
    })
    const { wrapper } = await mountIt()
    const textarea = wrapper.find('textarea')
    await textarea.setValue('Sit down')
    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(api.streamTurn).toHaveBeenCalledWith('s1', 'Sit down', expect.any(Function))
    expect((textarea.element as HTMLTextAreaElement).value).toBe('')
    expect(wrapper.findAll('aside li')).toHaveLength(2)
  })

  it('keeps the Direction and shows the error when a Turn fails', async () => {
    vi.mocked(api.streamTurn).mockImplementation(async (_id, _action, onEvent) => {
      onEvent({ type: 'failed', message: 'mflux crashed', sessionDiscarded: false })
    })
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('Sit down')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role=alert]').text()).toBe('mflux crashed')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Sit down')
  })

  it('offers Cancel while a Turn runs', async () => {
    vi.mocked(api.streamTurn).mockImplementation(() => new Promise(() => {}))
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('Sit down')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    expect(wrapper.find('textarea').attributes('disabled')).toBeDefined()
    await buttonNamed(wrapper, 'Cancel').trigger('click')
    expect(api.cancelTurn).toHaveBeenCalledWith('s1')
  })

  it('returns to the start screen when the Opening Turn is discarded', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session())
    vi.mocked(api.streamTurn).mockImplementation(async (_id, _action, onEvent) => {
      onEvent({ type: 'failed', message: 'Ollama: model not found', sessionDiscarded: true })
    })
    const { router } = await mountIt()
    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.query.error).toBe('Ollama: model not found')
  })

  it('shows an earlier Turn when picked from the Turn Log', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([turn(0, null), turn(1, 'Sit')]))
    const { wrapper } = await mountIt()
    expect(wrapper.find('main img').attributes('src')).toContain('turn-1.png')
    await wrapper.findAll('aside [data-turn]')[0].trigger('click')
    // The old image stays until the new one has loaded, then crossfades.
    expect(wrapper.find('main img').attributes('src')).toContain('turn-1.png')
    await loadImages()
    expect(wrapper.find('main img').attributes('src')).toContain('turn-0.png')
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

  it("shows the viewed Turn's Image Prompt as a word diff against the Turn before", async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([turn(0, null), turn(1, 'Sit', { prompt: promptFor(1).replace('calm', 'scared') })]),
    )
    const { wrapper } = await mountIt()
    await wrapper.findAll('[role=tab]')[1].trigger('click')
    const panel = wrapper.find('[role=tabpanel]')
    expect(panel.text()).toContain('Turn 1 · Sit')
    expect(panel.findAll('[data-diff=removed]').map((d) => d.text())).toEqual(['0, calm,'])
    expect(panel.findAll('[data-diff=added]').map((d) => d.text())).toEqual(['1, scared,'])
    expect(panel.text()).toContain('since Turn 0')
  })

  it('shows the Opening prompt without any diff', async () => {
    const { wrapper } = await mountIt()
    await wrapper.findAll('[role=tab]')[1].trigger('click')
    expect(wrapper.findAll('[data-diff=added], [data-diff=removed]')).toHaveLength(0)
    expect(wrapper.find('[data-prompt]').text()).toBe(promptFor(0))
  })

  it('labels declined and unclear Turns in the caption and the Turn Log', async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([
        turn(0, null),
        turn(1, 'Take the jacket off', { outcome: 'declined' }),
        turn(2, 'asdf qwer', { outcome: 'unclear' }),
      ]),
    )
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-outcome]').text()).toBe("Didn't understand")
    const log = wrapper.find('aside').text()
    expect(log).toContain('Declined')
    expect(log).toContain("Didn't understand")
    await wrapper.findAll('aside [data-turn]')[0].trigger('click')
    expect(wrapper.find('[data-outcome]').exists()).toBe(false)
  })

  it('undoes the latest Turn and puts its Direction back in the text box', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([turn(0, null), turn(1, 'Sit down')]))
    vi.mocked(api.undoTurn).mockResolvedValue(session([turn(0, null)]))
    const { wrapper } = await mountIt()
    await buttonNamed(wrapper, 'Undo').trigger('click')
    await loadImages()
    expect(api.undoTurn).toHaveBeenCalledWith('s1', 1)
    expect(wrapper.findAll('aside [data-turn]')).toHaveLength(1)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Sit down')
    expect(wrapper.find('main img').attributes('src')).toContain('turn-0.png')
  })

  it('keeps a half-typed Direction instead of overwriting it on Undo', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([turn(0, null), turn(1, 'Sit down')]))
    vi.mocked(api.undoTurn).mockResolvedValue(session([turn(0, null)]))
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('Kneel')
    await wrapper.find('[data-undo]').trigger('click')
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Kneel')
  })

  it('offers Undo only after the Opening Turn, on the latest Turn', async () => {
    const { wrapper } = await mountIt()
    expect(buttonNamed(wrapper, 'Undo').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-undo]').exists()).toBe(false)

    vi.mocked(api.getSession).mockResolvedValue(
      session([turn(0, null), turn(1, 'Sit'), turn(2, 'Stand')]),
    )
    const { wrapper: longer } = await mountIt()
    expect(buttonNamed(longer, 'Undo').attributes('disabled')).toBeUndefined()
    expect(longer.findAll('[data-undo]')).toHaveLength(1)
    expect(longer.findAll('aside li')[2].find('[data-undo]').exists()).toBe(true)
  })

  it('shows why an Undo was refused', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([turn(0, null), turn(1, 'Sit')]))
    vi.mocked(api.undoTurn).mockRejectedValue(
      new api.ApiError('Turn 1 is not the latest Turn', 409),
    )
    const { wrapper } = await mountIt()
    await buttonNamed(wrapper, 'Undo').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role=alert]').text()).toBe('Turn 1 is not the latest Turn')
  })

  it('shows when its render is waiting for another Session', async () => {
    let emit!: (e: api.TurnEvent) => void
    vi.mocked(api.streamTurn).mockImplementation((_id, _action, onEvent) => {
      emit = onEvent
      return new Promise(() => {})
    })
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('Sit')
    await buttonNamed(wrapper, 'Send').trigger('click')
    emit({ type: 'text', outcome: 'done', narration: 'Maya sits.', prompt: promptFor(0) })
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

  it('says when an earlier Turn is shown, and returns to the latest', async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([turn(0, null), turn(1, 'Sit'), turn(2, 'Stand'), turn(3, 'Kneel'), turn(4, 'Wave')]),
    )
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-viewing]').exists()).toBe(false)

    await wrapper.find('textarea').setValue('my draft')

    await wrapper.findAll('aside [data-turn]')[1].trigger('click')
    expect(wrapper.find('[data-viewing]').text()).toContain('Viewing Turn 1 of 4')
    const past = wrapper.find('[data-past-action]')
    expect((past.element as HTMLTextAreaElement).value).toBe('Sit')
    expect(past.attributes('readonly')).toBeDefined()
    expect(buttonNamed(wrapper, 'Send').attributes('disabled')).toBeDefined()
    // Enter in the read-only box must not send the hidden draft.
    await past.trigger('keydown', { key: 'Enter' })
    expect(api.streamTurn).not.toHaveBeenCalled()

    await wrapper.findAll('aside [data-turn]')[0].trigger('click')
    expect(wrapper.find('[data-viewing]').text()).toContain('Viewing the Opening of 4')
    expect((wrapper.find('[data-past-action]').element as HTMLTextAreaElement).value).toBe('')
    expect(wrapper.find('[data-past-action]').attributes('placeholder')).toBe(
      'The Opening Turn has no Action.',
    )

    await buttonNamed(wrapper, 'Back to latest').trigger('click')
    await loadImages()
    expect(wrapper.find('[data-viewing]').exists()).toBe(false)
    expect(wrapper.find('main img').attributes('src')).toContain('turn-4.png')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('my draft')
    expect(buttonNamed(wrapper, 'Send').attributes('disabled')).toBeUndefined()
  })

  it('streams the thinking in the caption area until the Narration arrives', async () => {
    let emit!: (e: api.TurnEvent) => void
    vi.mocked(api.streamTurn).mockImplementation((_id, _action, onEvent) => {
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

    emit({ type: 'text', outcome: 'done', narration: 'Maya sits.', prompt: promptFor(0) })
    await flushPromises()
    expect(wrapper.find('[data-thinking]').exists()).toBe(false)
    expect(wrapper.find('[data-caption]').text()).toBe('Maya sits.')
  })

  it("shows a Turn's saved thinking in the Prompt tab", async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session([turn(0, null), turn(1, 'Sit', { thinking: 'The stool is free.' })]),
    )
    const { wrapper } = await mountIt()
    await wrapper.findAll('[role=tab]')[1].trigger('click')
    expect(wrapper.find('[data-turn-thinking]').text()).toBe('The stool is free.')
    // The Opening had no thinking.
    await wrapper.findAll('[role=tab]')[0].trigger('click')
    await wrapper.findAll('aside [data-turn]')[0].trigger('click')
    await wrapper.findAll('[role=tab]')[1].trigger('click')
    expect(wrapper.find('[data-turn-thinking]').exists()).toBe(false)
  })

  it('asks before a reload or leaving the site while its Turn runs', async () => {
    const leaving = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    let finish!: () => void
    vi.mocked(api.streamTurn).mockImplementation(() => new Promise((r) => (finish = r)))
    const { wrapper } = await mountIt()
    expect(leaving()).toBe(false)

    await wrapper.find('textarea').setValue('Sit')
    await buttonNamed(wrapper, 'Send').trigger('click')
    expect(leaving()).toBe(true)

    finish()
    await flushPromises()
    expect(leaving()).toBe(false)
  })

  it('has no End or Reset', async () => {
    const { wrapper } = await mountIt()
    const labels = wrapper.findAll('button').map((b) => b.text())
    expect(labels).not.toContain('End')
    expect(labels).not.toContain('Reset')
  })
})
