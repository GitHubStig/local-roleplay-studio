import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '../api'
import SessionView from './SessionView.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSession: vi.fn(),
  streamTurn: vi.fn(),
  cancelTurn: vi.fn(),
  endSession: vi.fn(),
  createSession: vi.fn(),
}))

const turn = (index: number, action: string | null, extra: Partial<api.Turn> = {}): api.Turn => ({
  index,
  action,
  scene: { subject: { pose: `pose ${index}` } },
  narration: `Narration ${index}.`,
  declined: false,
  imagePrompt: `prompt ${index}`,
  image: `turn-${index}.png`,
  createdAt: '2026-09-24T00:00:00.000Z',
  ...extra,
})

const session = (
  turns: api.Turn[] = [],
  status: api.Session['status'] = 'active',
): api.Session => ({
  id: 's1',
  scenarioId: 'photoshoot',
  settings: {} as api.Settings,
  seed: 1,
  status,
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
  return { wrapper, router }
}

beforeEach(() => {
  vi.mocked(api.streamTurn).mockReset()
  vi.mocked(api.getSession).mockResolvedValue(session([turn(0, null)]))
})

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

    emit({ type: 'text', narration: 'Maya arrives.', declined: false, scene: {} })
    emit({ type: 'phase', phase: 'image' })
    await flushPromises()
    expect(wrapper.find('[data-provisional]').text()).toBe('Maya arrives.')
    expect(wrapper.find('[role=status]').text()).toContain('Rendering the image')

    emit({ type: 'committed', turn: turn(0, null, { narration: 'Maya arrives.' }) })
    finish()
    await flushPromises()
    expect(wrapper.find('[data-provisional]').exists()).toBe(false)
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
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role=alert]').text()).toBe('mflux crashed')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Sit down')
  })

  it('offers Cancel while a Turn runs', async () => {
    vi.mocked(api.streamTurn).mockImplementation(() => new Promise(() => {}))
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('Sit down')
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('textarea').attributes('disabled')).toBeDefined()
    const cancel = wrapper.findAll('button').find((b) => b.text() === 'Cancel')!
    await cancel.trigger('click')
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
    await wrapper.findAll('aside button')[0].trigger('click')
    expect(wrapper.find('main img').attributes('src')).toContain('turn-0.png')
  })

  it('shows an ended Session as read-only', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session([turn(0, null)], 'ended'))
    const { wrapper } = await mountIt()
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.text()).toContain('This Session has ended.')
  })
})
