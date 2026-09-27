import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '../api'
import { useCurrentSession } from '../composables/useCurrentSession'
import * as roleplay from './api'
import RoleplayView from './RoleplayView.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSession: vi.fn(),
  cancelFrame: vi.fn(),
}))
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof roleplay>()),
  writeCast: vi.fn(),
  beginRoleplay: vi.fn(),
  sendMessage: vi.fn(),
  undoExchange: vi.fn(),
  saveCast: vi.fn(),
  pictureFrame: vi.fn(),
  renderFrame: vi.fn(),
  saveLook: vi.fn(),
}))

const cast: roleplay.Cast = {
  character: {
    name: 'Elena',
    age: 38,
    appearance: 'Wild hair, wool sweater.',
    personality: 'Gruff, kind underneath.',
    voice: 'Direct.',
    background: 'Five years on the rock.',
    goal: 'Keep the light burning.',
  },
  persona: { name: 'Cal', role: 'A stranded sailor.', appearance: 'Soaked.' },
  setting: { place: 'The lighthouse.', time: 'Midnight.', weather: 'A gale.' },
}

const reply = (dialogue: string, extra: Partial<roleplay.Reply> = {}): roleplay.Reply => ({
  internal: 'He is freezing.',
  actions: 'Elena pulls him inside.',
  dialogue,
  ...extra,
})

const frame = (
  index: number,
  message: string | null,
  dialogue: string,
): roleplay.RoleplayFrame => ({
  index,
  message,
  reply: reply(dialogue),
  image: null,
  createdAt: '2026-09-27T00:00:00.000Z',
})

const roleplaySession = (frames: roleplay.RoleplayFrame[] = []): roleplay.RoleplaySession => ({
  id: 'r1',
  kind: 'roleplay',
  brief: 'A lighthouse in a storm.',
  scenarioId: null,
  settings: {} as api.Settings,
  seed: 1,
  createdAt: '2026-09-27T00:00:00.000Z',
  cast: frames.length ? cast : null,
  frames,
})

async function mountIt() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: {} },
      { path: '/sessions/:id', component: {} },
      { path: '/roleplay/:id', component: {} },
    ],
  })
  await router.push('/roleplay/r1')
  const wrapper = mount(RoleplayView, { props: { id: 'r1' }, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

/** A stream held open: `emit` sends events, `finish` ends it. */
function held() {
  let emit!: (e: roleplay.RoleplayEvent) => void
  let finish!: () => void
  const call = (onEvent: (e: roleplay.RoleplayEvent) => void) =>
    new Promise<void>((resolve) => {
      emit = onEvent
      finish = resolve
    })
  return { call, emit: (e: roleplay.RoleplayEvent) => emit(e), finish: () => finish() }
}

const buttonNamed = (wrapper: Awaited<ReturnType<typeof mountIt>>['wrapper'], name: string) =>
  wrapper.findAll('button').find((b) => b.text() === name)!

beforeEach(() => {
  localStorage.clear()
  for (
    const fn of [
      roleplay.writeCast,
      roleplay.beginRoleplay,
      roleplay.sendMessage,
      roleplay.undoExchange,
      roleplay.saveCast,
    ]
  ) {
    vi.mocked(fn).mockReset()
  }
  vi.mocked(api.getSession).mockResolvedValue(roleplaySession([frame(0, null, 'Get inside.')]))
})

afterEach(() => vi.unstubAllGlobals())
enableAutoUnmount(afterEach)

describe('RoleplayView', () => {
  it('writes the Cast for review first, then begins with the opening reply', async () => {
    vi.mocked(api.getSession).mockResolvedValue(roleplaySession())
    const stream = held()
    vi.mocked(roleplay.writeCast).mockImplementation((_id, onEvent) => stream.call(onEvent))
    const { wrapper } = await mountIt()
    expect(wrapper.find('[role=status]').text()).toBe('Writing the Cast…')

    stream.emit({ type: 'cast', cast, session: { ...roleplaySession(), cast } })
    stream.finish()
    await flushPromises()
    expect((wrapper.find('[data-field="character.name"]').element as HTMLInputElement).value)
      .toBe('Elena')
    expect(wrapper.find('[data-review]').exists()).toBe(true)
    expect(wrapper.find('textarea:not([data-field])').attributes('disabled')).toBeDefined()

    const opened = roleplaySession([frame(0, null, 'Get inside.')])
    vi.mocked(roleplay.beginRoleplay).mockImplementation(async (_id, onEvent) =>
      onEvent({ type: 'replied', frame: opened.frames[0], session: opened })
    )
    await wrapper.find('[data-begin]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-review]').exists()).toBe(false)
    expect(wrapper.find('[data-reply] [data-dialogue]').text()).toBe('“Get inside.”')
    expect(useCurrentSession().currentSessionKind.value).toBe('roleplay')
  })

  it('saves Cast edits before beginning', async () => {
    vi.mocked(api.getSession).mockResolvedValue({ ...roleplaySession(), cast })
    vi.mocked(roleplay.saveCast).mockImplementation(async (_id, c) => ({
      ...roleplaySession(),
      cast: c,
    }))
    vi.mocked(roleplay.beginRoleplay).mockResolvedValue()
    const { wrapper } = await mountIt()
    expect(roleplay.writeCast).not.toHaveBeenCalled()
    await wrapper.find('[data-field="character.goal"]').setValue('Find the missing boat.')
    await wrapper.find('[data-begin]').trigger('click')
    await flushPromises()
    expect(vi.mocked(roleplay.saveCast).mock.calls[0][1].character.goal).toBe(
      'Find the missing boat.',
    )
    expect(roleplay.beginRoleplay).toHaveBeenCalled()
    expect(vi.mocked(roleplay.saveCast).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(roleplay.beginRoleplay).mock.invocationCallOrder[0],
    )
  })

  it('rewrites the Cast on request', async () => {
    vi.mocked(api.getSession).mockResolvedValue({ ...roleplaySession(), cast })
    vi.mocked(roleplay.writeCast).mockResolvedValue()
    const { wrapper } = await mountIt()
    await wrapper.find('[data-rewrite]').trigger('click')
    expect(roleplay.writeCast).toHaveBeenCalledWith('r1', expect.any(Function))
  })

  it("doesn't write a Cast again once the scene has begun", async () => {
    await mountIt()
    expect(roleplay.writeCast).not.toHaveBeenCalled()
    expect(roleplay.beginRoleplay).not.toHaveBeenCalled()
  })

  it('shows the message at once, then the reply as each field arrives', async () => {
    const stream = held()
    vi.mocked(roleplay.sendMessage).mockImplementation((_id, _text, onEvent) =>
      stream.call(onEvent)
    )
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('Did anyone else make it?')
    await buttonNamed(wrapper, 'Send').trigger('click')
    expect(roleplay.sendMessage).toHaveBeenCalledWith(
      'r1',
      'Did anyone else make it?',
      expect.any(Function),
    )
    expect(wrapper.find('[data-pending-message]').text()).toContain('Did anyone else make it?')
    expect(wrapper.find('[role=status]').text()).toBe('Elena is replying…')

    stream.emit({ type: 'reply-part', key: 'actions', value: 'Elena looks away.' })
    await flushPromises()
    expect(wrapper.find('[data-pending-reply]').text()).toContain('Elena looks away.')

    const done = roleplaySession([
      frame(0, null, 'Get inside.'),
      frame(1, 'Did anyone else make it?', 'One.'),
    ])
    stream.emit({ type: 'replied', frame: done.frames[1], session: done })
    stream.finish()
    await flushPromises()
    expect(wrapper.findAll('[data-message]').map((m) => m.text())).toEqual([
      'CalDid anyone else make it?',
    ])
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('')
  })

  it('keeps a declined message in the box to reword', async () => {
    vi.mocked(roleplay.sendMessage).mockImplementation(async (_id, _text, onEvent) =>
      onEvent({ type: 'declined', message: 'Declined: no restraint, captivity or non-consent.' })
    )
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('I tie her up.')
    await buttonNamed(wrapper, 'Send').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role=alert]').text()).toBe(
      'Declined: no restraint, captivity or non-consent.',
    )
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('I tie her up.')
    expect(wrapper.findAll('[data-message]')).toHaveLength(0)
  })

  it('undoes the latest exchange, putting its message back in the box; never the opening', async () => {
    const two = roleplaySession([frame(0, null, 'Get inside.'), frame(1, 'Thanks.', 'Sit.')])
    vi.mocked(api.getSession).mockResolvedValue(two)
    vi.mocked(roleplay.undoExchange).mockResolvedValue(
      roleplaySession([frame(0, null, 'Get inside.')]),
    )
    const { wrapper } = await mountIt()
    await buttonNamed(wrapper, 'Undo').trigger('click')
    await flushPromises()
    expect(roleplay.undoExchange).toHaveBeenCalledWith('r1', 1)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('Thanks.')
    expect(buttonNamed(wrapper, 'Undo').attributes('disabled')).toBeDefined()
  })

  it('hides the Character’s thoughts when asked, remembering the choice', async () => {
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-internal]').exists()).toBe(true)
    await wrapper.find('[data-hide-thoughts]').setValue(true)
    expect(wrapper.find('[data-internal]').exists()).toBe(false)
    expect(localStorage.getItem('roleplay-thoughts-hidden')).toBe('1')
  })

  it('saves an edited Cast', async () => {
    vi.mocked(roleplay.saveCast).mockImplementation(async (_id, c) => ({
      ...roleplaySession([frame(0, null, 'Get inside.')]),
      cast: c,
    }))
    const { wrapper } = await mountIt()
    await wrapper.find('[data-field="persona.name"]').setValue('Callum')
    await wrapper.find('[data-cast-panel] form').trigger('submit')
    await flushPromises()
    expect(roleplay.saveCast).toHaveBeenCalledWith('r1', {
      ...cast,
      persona: { ...cast.persona, name: 'Callum' },
    })
    expect(wrapper.text()).toContain('Applies from the next reply.')
  })

  it('sends a Chain to its own screen', async () => {
    vi.mocked(api.getSession).mockResolvedValue({ ...roleplaySession(), kind: 'chain' } as never)
    const { router } = await mountIt()
    expect(router.currentRoute.value.path).toBe('/sessions/r1')
  })

  it('pictures a Frame and shows its Image Prompt under the Reply, with the Look to edit', async () => {
    const stream = held()
    vi.mocked(roleplay.pictureFrame).mockImplementation((_id, _i, onEvent) => stream.call(onEvent))
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-look]').exists()).toBe(false)
    await wrapper.find('[data-picture-button]').trigger('click')
    expect(roleplay.pictureFrame).toHaveBeenCalledWith('r1', 0, expect.any(Function))
    expect(wrapper.find('[role=status]').text()).toBe('Frame 0: Writing the Look, then picturing…')
    // Shown where it was asked for: the Reply sweeps and says so, with its own Cancel; the text
    // box stays usable and still, and Send waits.
    expect(wrapper.find('[data-reply]').classes()).toContain('render-sweep')
    expect(wrapper.find('[data-picturing]').text()).toContain('Writing the Look, then picturing…')
    expect(wrapper.find('[data-writing]').exists()).toBe(false)
    const box = wrapper.find('textarea:not([data-field])')
    expect(box.attributes('disabled')).toBeUndefined()
    await box.setValue('Next move')
    expect(buttonNamed(wrapper, 'Send').attributes('disabled')).toBeDefined()

    const look = { character: 'Elena, 38.', persona: 'Cal, 25.', style: 'Oil painting.' }
    const done = {
      ...roleplaySession([{
        ...frame(0, null, 'Get inside.'),
        promptText: 'adult, Elena, 38. She waits. Oil painting.',
        pictureTimings: { text: 24.6 },
        blocked: 'no sexual or nude imagery',
        shown: 'character' as const,
      }]),
      look,
    }
    stream.emit({ type: 'look', look })
    stream.emit({ type: 'pictured', frame: done.frames[0], session: done })
    stream.finish()
    await flushPromises()
    expect(wrapper.find('[data-image-prompt]').text()).toContain('adult, Elena, 38. She waits.')
    expect(wrapper.find('[data-image-prompt] summary').text()).toContain('crosses a limit')
    expect(wrapper.find('[data-picture-timings]').text()).toBe('Pictured in 24.6 s')
    expect(wrapper.find('[data-shown]').text()).toBe('Shows Elena')
    expect(wrapper.find('[data-reply]').classes()).not.toContain('render-sweep')
    expect(wrapper.find('[data-picture-button]').text()).toBe('Picture again')

    vi.mocked(roleplay.saveLook).mockResolvedValue({ ...done, look: { ...look, style: 'Ink.' } })
    await wrapper.findAll('[data-look] textarea')[2].setValue('Ink.')
    await wrapper.find('[data-look]').trigger('submit')
    await flushPromises()
    expect(roleplay.saveLook).toHaveBeenCalledWith('r1', { ...look, style: 'Ink.' })
  })

  it("doesn't scroll the conversation while a Frame is pictured", async () => {
    const stream = held()
    vi.mocked(roleplay.pictureFrame).mockImplementation((_id, _i, onEvent) => stream.call(onEvent))
    const { wrapper } = await mountIt()
    const scroll = vi.fn()
    ;(wrapper.find('[data-transcript]').element as HTMLElement).scrollTo = scroll
    await wrapper.find('[data-picture-button]').trigger('click')
    stream.emit({ type: 'look', look: { character: 'Elena.', persona: 'Cal.', style: 'Ink.' } })
    stream.finish()
    await flushPromises()
    expect(scroll).not.toHaveBeenCalled()
  })

  it('renders a pictured Frame in place, then shows the picture under its Reply', async () => {
    const pictured = {
      ...frame(0, null, 'Get inside.'),
      promptText: 'adult, Elena, 38. She waits. Ink.',
    }
    vi.mocked(api.getSession).mockResolvedValue({
      ...roleplaySession([pictured]),
      look: { character: 'Elena, 38.', persona: 'Cal, 25.', style: 'Ink.' },
    })
    const stream = held()
    vi.mocked(roleplay.renderFrame).mockImplementation((_id, _i, onEvent) => stream.call(onEvent))
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-upscale-button]').exists()).toBe(false)
    await wrapper.find('[data-render-button]').trigger('click')
    expect(roleplay.renderFrame).toHaveBeenCalledWith('r1', 0, expect.any(Function))

    stream.emit({ type: 'phase', phase: 'queued' })
    await flushPromises()
    expect(wrapper.find('[data-picturing]').text()).toContain('Waiting for another render…')
    expect(wrapper.find('[data-reply]').attributes('data-rendering')).toBe('queued')
    stream.emit({ type: 'phase', phase: 'image' })
    stream.emit({ type: 'progress', step: 2, total: 4 })
    await flushPromises()
    expect(wrapper.find('[data-picturing]').text()).toContain('Rendering… step 2 of 4')

    const done = {
      ...roleplaySession([{ ...pictured, image: 'frame-0-aaaaaaaa.png' }]),
      look: { character: 'Elena, 38.', persona: 'Cal, 25.', style: 'Ink.' },
    }
    stream.emit({ type: 'rendered', frame: done.frames[0], session: done })
    stream.finish()
    await flushPromises()
    expect(wrapper.find('[data-picture-image] img').attributes('src')).toBe(
      '/api/sessions/r1/images/frame-0-aaaaaaaa.png',
    )
    expect(wrapper.find('[data-render-button]').text()).toBe('Re-render')
    // Clicking the picture opens it in the viewer, not a new tab.
    await wrapper.find('[data-picture-image]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-image-viewer] [data-image-frame]').exists()).toBe(true)
    expect(wrapper.find('[data-upscale-button]').text()).toBe('Upscale')
  })
})
