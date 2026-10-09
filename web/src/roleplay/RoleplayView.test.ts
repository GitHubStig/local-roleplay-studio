import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '../api'
import { useCurrentSession } from '../composables/useCurrentSession'
import { useFeatures } from '../composables/useFeatures'
import { ALL_AVAILABLE, ALL_ON } from '../testing'
import * as roleplay from './api'
import RoleplayView from './RoleplayView.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSession: vi.fn(),
  cancelFrame: vi.fn(),
  getSettings: vi.fn(),
  getSettingsOptions: vi.fn(),
  listJobs: vi.fn(),
  queueJob: vi.fn(),
  cancelJob: vi.fn(),
  retryJob: vi.fn(),
}))
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof roleplay>()),
  writeCast: vi.fn(),
  beginRoleplay: vi.fn(),
  sendMessage: vi.fn(),
  suggestMessage: vi.fn(),
  undoExchange: vi.fn(),
  saveCast: vi.fn(),
  saveLook: vi.fn(),
  saveVoice: vi.fn(),
}))

// The 3D viewer's drawing needs WebGL, which tests don't have; it reports it couldn't draw.
vi.mock('three', () => ({}))
vi.mock('@sparkjsdev/spark', () => ({}))
vi.mock('three/addons/controls/OrbitControls.js', () => ({}))

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
      roleplay.suggestMessage,
      roleplay.undoExchange,
      roleplay.saveCast,
    ]
  ) {
    vi.mocked(fn).mockReset()
  }
  vi.mocked(api.getSession).mockResolvedValue(roleplaySession([frame(0, null, 'Get inside.')]))
  // A new Reply queues its picture and render (Picture replies is on by default).
  vi.mocked(api.queueJob).mockReset().mockResolvedValue([])
  vi.mocked(api.listJobs).mockReset().mockResolvedValue([])
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
    // The Cast's border sweeps while it's written.
    expect(wrapper.find('[data-cast]').classes()).toContain('render-sweep')

    stream.emit({ type: 'cast', cast, session: { ...roleplaySession(), cast } })
    stream.finish()
    await flushPromises()
    expect((wrapper.find('[data-field="character.name"]').element as HTMLInputElement).value)
      .toBe('Elena')
    expect(wrapper.find('[data-review]').exists()).toBe(true)
    expect(wrapper.find('textarea:not([data-field])').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-cast]').classes()).not.toContain('render-sweep')

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

  it('rewrites the Cast on request, its border sweeping meanwhile', async () => {
    vi.mocked(api.getSession).mockResolvedValue({ ...roleplaySession(), cast })
    const stream = held()
    vi.mocked(roleplay.writeCast).mockImplementation((_id, onEvent) => stream.call(onEvent))
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-cast]').classes()).not.toContain('render-sweep')
    await wrapper.find('[data-rewrite]').trigger('click')
    expect(roleplay.writeCast).toHaveBeenCalledWith('r1', expect.any(Function))
    expect(wrapper.find('[data-cast]').classes()).toContain('render-sweep')
    stream.emit({ type: 'cast', cast, session: { ...roleplaySession(), cast } })
    stream.finish()
    await flushPromises()
    expect(wrapper.find('[data-cast]').classes()).not.toContain('render-sweep')
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

  it('suggests a message into the box, from what was typed, without sending it', async () => {
    const stream = held()
    vi.mocked(roleplay.suggestMessage).mockImplementation((_id, _draft, onEvent) =>
      stream.call(onEvent)
    )
    const { wrapper } = await mountIt()
    const box = () => wrapper.find('textarea').element as HTMLTextAreaElement
    await wrapper.find('textarea').setValue('ask about the others')
    await wrapper.find('[data-suggest]').trigger('click')
    expect(roleplay.suggestMessage).toHaveBeenCalledWith(
      'r1',
      'ask about the others',
      expect.any(Function),
    )
    expect(wrapper.find('[role=status]').text()).toBe("Suggesting Cal's message…")
    expect(wrapper.find('[data-suggesting]').exists()).toBe(true)
    expect(wrapper.find('[data-pending-reply]').exists()).toBe(false)
    expect(buttonNamed(wrapper, 'Cancel').exists()).toBe(true)

    stream.emit({ type: 'suggestion-part', text: 'Cal: I ask' })
    await flushPromises()
    expect(box().value).toBe('Cal: I ask')
    stream.emit({ type: 'suggestion', text: 'I ask whether anyone else made it.' })
    stream.finish()
    await flushPromises()
    expect(box().value).toBe('I ask whether anyone else made it.')
    expect(box().disabled).toBe(false)
    expect(roleplay.sendMessage).not.toHaveBeenCalled()
  })

  it('puts back what was typed when a suggestion fails', async () => {
    vi.mocked(roleplay.suggestMessage).mockImplementation(async (_id, _draft, onEvent) => {
      onEvent({ type: 'suggestion-part', text: 'I pull' })
      onEvent({
        type: 'failed',
        message: 'The suggestion crossed a limit',
        sessionDiscarded: false,
      })
    })
    const { wrapper } = await mountIt()
    await wrapper.find('textarea').setValue('grab her')
    await wrapper.find('[data-suggest]').trigger('click')
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('grab her')
    expect(wrapper.find('[role=alert]').text()).toBe('The suggestion crossed a limit')
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
    await wrapper.find('[data-cast-form]').trigger('submit')
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

  const look = {
    people: [{ name: 'Elena', identity: 'Elena, 38.' }, { name: 'Cal', identity: 'Cal, 25.' }],
    style: 'Oil painting.',
  }
  const job = (extra: Partial<roleplay.Job>): roleplay.Job => ({
    id: 'j1',
    kind: 'picture',
    frameIndex: 0,
    status: 'queued',
    createdAt: '2026-09-27T00:00:00.000Z',
    ...extra,
  })

  describe('voices', () => {
    const voice = { description: 'A gruff woman of forty.', ref: 'voice-aaaaaaaa.wav' }
    const spoken = (ref = voice.ref) => ({
      ...frame(0, null, 'Get inside.'),
      speech: {
        file: 'speech-0-bbbbbbbb.wav',
        ref,
        timings: { audio: 1.2 },
        delivery: { pace: 'slow' as const, sound: 'sigh' as const },
      },
    })
    let played: string[]
    beforeEach(() => {
      played = []
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
        function (this: HTMLMediaElement) {
          played.push(this.src.replace(/^.*\/images\//, ''))
          return Promise.resolve()
        },
      )
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
      vi.mocked(api.queueJob).mockReset().mockResolvedValue([])
    })
    afterEach(() => vi.restoreAllMocks())

    it('speaks a line on Listen, then plays it once it is ready', async () => {
      vi.mocked(api.queueJob).mockResolvedValue([
        job({ kind: 'speak', status: 'running', phase: 'audio' }),
      ])
      const { wrapper } = await mountIt()
      await wrapper.find('[data-listen]').trigger('click')
      await flushPromises()
      expect(api.queueJob).toHaveBeenCalledWith('r1', 'speak', 0)
      expect(wrapper.find('[data-frame-job]').text()).toContain('Listen · Designing the voice…')
      expect(wrapper.find('[data-listen]').attributes('disabled')).toBeDefined()

      vi.mocked(api.listJobs).mockResolvedValue([])
      vi.mocked(api.getSession).mockResolvedValue({ ...roleplaySession([spoken()]), cast, voice })
      await new Promise((r) => setTimeout(r, 1100))
      await flushPromises()
      expect(played).toEqual(['speech-0-bbbbbbbb.wav'])
      expect(wrapper.find('[data-listen]').text()).toBe('■ Stop')
    })

    it('plays a line already spoken, and speaks again one spoken in an earlier voice', async () => {
      vi.mocked(api.getSession).mockResolvedValue({ ...roleplaySession([spoken()]), cast, voice })
      const { wrapper } = await mountIt()
      await wrapper.find('[data-listen]').trigger('click')
      await flushPromises()
      expect([played, vi.mocked(api.queueJob).mock.calls]).toEqual([
        ['speech-0-bbbbbbbb.wav'],
        [],
      ])
      expect(wrapper.find('[data-delivery]').text()).toBe('· slowly, with a sigh')

      vi.mocked(api.getSession).mockResolvedValue({
        ...roleplaySession([spoken('voice-cccccccc.wav')]),
        cast,
        voice,
      })
      const { wrapper: other } = await mountIt()
      vi.mocked(api.queueJob).mockResolvedValue([job({ kind: 'speak' })])
      expect(other.find('[data-listen]').attributes('title')).toContain('earlier voice')
      await other.find('[data-listen]').trigger('click')
      await flushPromises()
      expect(api.queueJob).toHaveBeenCalledWith('r1', 'speak', 0)
    })

    it('says a line was spoken as written when directing it failed, and speaks it again', async () => {
      const { delivery: _, ...plain } = spoken().speech
      vi.mocked(api.getSession).mockResolvedValue({
        ...roleplaySession([{
          ...spoken(),
          speech: { ...plain, undirected: 'Ollama: llama-server process has terminated' },
        }]),
        cast,
        voice,
      })
      const { wrapper } = await mountIt()
      const note = wrapper.find('[data-undirected]')
      expect(note.text()).toContain('spoken as written')
      expect(note.attributes('title')).toContain('llama-server process has terminated')
      vi.mocked(api.queueJob).mockResolvedValue([job({ kind: 'speak' })])
      await note.find('[data-speak-again]').trigger('click')
      await flushPromises()
      expect(api.queueJob).toHaveBeenCalledWith('r1', 'speak', 0)
      // A directed line has no such note.
      vi.mocked(api.getSession).mockResolvedValue({ ...roleplaySession([spoken()]), cast, voice })
      const { wrapper: directed } = await mountIt()
      expect(directed.find('[data-undirected]').exists()).toBe(false)
    })

    it('speaks a thought on its own Listen, and hides it with the thoughts', async () => {
      vi.mocked(api.queueJob).mockResolvedValue([
        job({ kind: 'speak-thought', status: 'running', phase: 'audio' }),
      ])
      const { wrapper } = await mountIt()
      await wrapper.find('[data-listen-thought]').trigger('click')
      await flushPromises()
      expect(api.queueJob).toHaveBeenCalledWith('r1', 'speak-thought', 0)
      expect(wrapper.find('[data-frame-job]').text()).toContain('Listen to thought')

      vi.mocked(api.listJobs).mockResolvedValue([])
      vi.mocked(api.getSession).mockResolvedValue({
        ...roleplaySession([{
          ...frame(0, null, 'Get inside.'),
          thoughtSpeech: { file: 'thought-0-cccccccc.wav', ref: voice.ref, timings: { audio: 2 } },
        }]),
        cast,
        voice,
      })
      await new Promise((r) => setTimeout(r, 1100))
      await flushPromises()
      expect(played).toEqual(['thought-0-cccccccc.wav'])
      expect(wrapper.find('[data-listen-thought]').text()).toBe('■ Stop')
      expect(wrapper.find('[data-listen]').text()).toBe('▶ Listen')

      await wrapper.find('[data-hide-thoughts]').setValue(true)
      expect(wrapper.find('[data-listen-thought]').exists()).toBe(false)
    })

    it('has nothing to Listen to in a line of only "…"', async () => {
      vi.mocked(api.getSession).mockResolvedValue(roleplaySession([frame(0, null, '...')]))
      const { wrapper } = await mountIt()
      expect(wrapper.find('[data-listen]').exists()).toBe(false)
    })

    it('speaks each new reply while Speak replies is on', async () => {
      vi.mocked(api.queueJob).mockResolvedValue([job({ kind: 'speak', frameIndex: 1 })])
      const done = roleplaySession([frame(0, null, 'Get inside.'), frame(1, 'Hello.', 'Sit.')])
      vi.mocked(roleplay.sendMessage).mockImplementation(async (_id, _text, onEvent) =>
        onEvent({ type: 'replied', frame: done.frames[1], session: done })
      )
      const { wrapper } = await mountIt()
      await wrapper.find('[data-autoplay]').setValue(true)
      await wrapper.find('textarea').setValue('Hello.')
      await buttonNamed(wrapper, 'Send').trigger('click')
      await flushPromises()
      expect(api.queueJob).toHaveBeenCalledWith('r1', 'speak', 1)
    })

    it('pictures each new reply by default, renders it too only with Render replies on', async () => {
      vi.mocked(api.queueJob).mockReset().mockResolvedValue([
        job({ kind: 'picture', frameIndex: 1 }),
      ])
      const done = roleplaySession([frame(0, null, 'Get inside.'), frame(1, 'Hello.', 'Sit.')])
      vi.mocked(roleplay.sendMessage).mockImplementation(async (_id, _text, onEvent) =>
        onEvent({ type: 'replied', frame: done.frames[1], session: done })
      )
      const { wrapper } = await mountIt()
      const send = async (text: string) => {
        vi.mocked(api.queueJob).mockClear()
        await wrapper.find('textarea').setValue(text)
        await buttonNamed(wrapper, 'Send').trigger('click')
        await flushPromises()
        return vi.mocked(api.queueJob).mock.calls
      }
      expect((wrapper.find('[data-picture-replies]').element as HTMLInputElement).checked).toBe(
        true,
      )
      expect((wrapper.find('[data-render-replies]').element as HTMLInputElement).checked).toBe(
        false,
      )
      expect(await send('Hello.')).toEqual([['r1', 'picture', 1]])

      await wrapper.find('[data-render-replies]').setValue(true)
      expect(await send('Hello.')).toEqual([['r1', 'picture', 1], ['r1', 'render', 1]])

      // Rendering needs the picture: off with it.
      await wrapper.find('[data-picture-replies]').setValue(false)
      expect(wrapper.find('[data-render-replies]').attributes('disabled')).toBeDefined()
      expect(await send('Hello.')).toEqual([])
    })

    it('cancels the render queued behind a picture with it', async () => {
      const picture = job({ id: 'p', kind: 'picture', frameIndex: 0, status: 'running' })
      const render = job({ id: 'r', kind: 'render', frameIndex: 0, status: 'queued' })
      vi.mocked(api.listJobs).mockResolvedValue([picture, render])
      vi.mocked(api.cancelJob).mockResolvedValue([render])
      const { wrapper } = await mountIt()
      const cancel = wrapper.findAll('[data-frame-job] button').find((b) => b.text() === 'Cancel')!
      await cancel.trigger('click')
      await flushPromises()
      expect(vi.mocked(api.cancelJob).mock.calls).toEqual([['r1', 'p'], ['r1', 'r']])
    })

    it('edits the voice, designs it again, and plays it', async () => {
      vi.mocked(api.getSession).mockResolvedValue({ ...roleplaySession([spoken()]), cast, voice })
      vi.mocked(roleplay.saveVoice).mockResolvedValue({
        ...roleplaySession([spoken()]),
        cast,
        voice: { description: 'A deep man.' },
      })
      vi.mocked(api.queueJob).mockResolvedValue([
        job({ kind: 'voice', status: 'running', phase: 'audio' }),
      ])
      const { wrapper } = await mountIt()
      const panel = wrapper.find('[data-voice]')
      expect(panel.classes()).not.toContain('render-sweep')
      await panel.find('[data-play-voice]').trigger('click')
      await flushPromises()
      expect(played).toEqual(['voice-aaaaaaaa.wav'])

      await panel.find('[data-field="voice.description"]').setValue('A deep man.')
      await panel.trigger('submit')
      await flushPromises()
      expect(roleplay.saveVoice).toHaveBeenCalledWith('r1', 'A deep man.')
      expect(api.queueJob).toHaveBeenCalledWith('r1', 'voice', 0)
      expect(wrapper.find('[data-voice-job]').text()).toContain('Designing the voice…')
      // Its panel's border sweeps meanwhile; not before.
      expect(wrapper.find('[data-voice]').classes()).toContain('render-sweep')
      // Designing the voice is the Roleplay's, not the opening Frame's.
      expect(wrapper.find('[data-frame-job]').exists()).toBe(false)
      expect(wrapper.find('[data-reply]').classes()).not.toContain('render-sweep')
    })
  })

  it('queues picturing, shows it on the Frame, and shows the result once the job is done', async () => {
    vi.mocked(api.queueJob).mockResolvedValue([job({ status: 'running', phase: 'text' })])
    const { wrapper } = await mountIt()
    await wrapper.find('[data-picture-button]').trigger('click')
    await flushPromises()
    expect(api.queueJob).toHaveBeenCalledWith('r1', 'picture', 0)
    expect(wrapper.find('[data-reply]').classes()).toContain('render-sweep')
    expect(wrapper.find('[data-frame-job]').text()).toContain(
      'Picture · Writing the Look, then picturing…',
    )
    expect(wrapper.find('[data-picture-button]').attributes('disabled')).toBeDefined()
    // The conversation carries on meanwhile: the text box and Send stay usable.
    const box = wrapper.find('textarea:not([data-field])')
    expect(box.attributes('disabled')).toBeUndefined()
    await box.setValue('Next move')
    expect(buttonNamed(wrapper, 'Send').attributes('disabled')).toBeUndefined()

    // The job finishes: the queue empties and the Roleplay reloads with the picture.
    vi.mocked(api.listJobs).mockResolvedValue([])
    vi.mocked(api.getSession).mockResolvedValue({
      ...roleplaySession([{
        ...frame(0, null, 'Get inside.'),
        prompt: 'Elena, 38. She waits. Oil painting.',
        shown: ['Elena', 'the barkeep'],
        pictureTimings: { text: 24.6 },
        pictureModel: 'gemma4',
        pictureStyle: 'tags',
      }]),
      look,
    })
    await new Promise((r) => setTimeout(r, 1100))
    await flushPromises()
    expect(wrapper.find('[data-reply]').classes()).not.toContain('render-sweep')
    expect(wrapper.find('[data-image-prompt]').text()).toContain('Elena, 38. She waits.')
    expect(wrapper.find('[data-shown]').text()).toBe('Shows Elena and the barkeep')
    expect(wrapper.find('[data-picture-timings]').text()).toBe(
      'Pictured in 24.6 s by gemma4, as tags',
    )
    expect(wrapper.find('[data-picture-button]').text()).toBe('Picture again')

    vi.mocked(roleplay.saveLook).mockResolvedValue({ ...roleplaySession(), look })
    // The Look lists its people; their names come from the Cast, so they aren't edited, no one is
    // added by hand, and the Character and Persona can't be removed.
    expect(wrapper.findAll('[data-look] [data-person]')).toHaveLength(2)
    expect(wrapper.find('[data-look] [data-person-name]').exists()).toBe(false)
    expect(wrapper.find('[data-look] [data-add-person]').exists()).toBe(false)
    expect(wrapper.findAll('[data-look] button').map((b) => b.text())).not.toContain('Remove')
    await wrapper.findAll('[data-look] textarea').at(-1)!.setValue('Ink.')
    await wrapper.find('[data-look]').trigger('submit')
    await flushPromises()
    expect(roleplay.saveLook).toHaveBeenCalledWith('r1', { ...look, style: 'Ink.' })
  })

  it('shows rendering progress in place, and the picture beside its Reply once rendered', async () => {
    const pictured = { ...frame(0, null, 'Get inside.'), prompt: 'Elena. Ink.' }
    vi.mocked(api.getSession).mockResolvedValue({ ...roleplaySession([pictured]), look })
    vi.mocked(api.listJobs).mockResolvedValue([
      job({ kind: 'render', status: 'running', phase: 'image', progress: { step: 2, total: 4 } }),
      job({ id: 'j2', kind: 'upscale' }),
    ])
    const { wrapper } = await mountIt()
    const lines = wrapper.findAll('[data-frame-job]').map((l) => l.text())
    expect(lines[0]).toContain('Render · Rendering… step 2 of 4')
    expect(lines[1]).toContain('Upscale · Queued')
    expect(wrapper.find('[data-render-button]').attributes('disabled')).toBeDefined()

    vi.mocked(api.listJobs).mockResolvedValue([])
    vi.mocked(api.getSession).mockResolvedValue({
      ...roleplaySession([{ ...pictured, image: 'frame-0-aaaaaaaa.png' }]),
      look,
    })
    await new Promise((r) => setTimeout(r, 1100))
    await flushPromises()
    expect(wrapper.find('[data-picture-image] img').attributes('src')).toBe(
      '/api/sessions/r1/images/frame-0-aaaaaaaa.png',
    )
    expect(wrapper.find('[data-render-button]').text()).toBe('Re-render')
    // Clicking the picture opens it in the viewer, not a new tab.
    await wrapper.find('[data-picture-image]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-image-viewer] [data-image-frame]').exists()).toBe(true)
  })

  it('says when a job is downloading its model, the first time it is used', async () => {
    vi.mocked(api.listJobs).mockResolvedValue([
      job({ kind: 'speak', status: 'running', phase: 'download' }),
    ])
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-frame-job]').text()).toContain(
      'Listen · Downloading the model (first use only)…',
    )
  })

  it('lists jobs in the Queue tab: each goes to its Frame and can be cancelled', async () => {
    const failed = job({ id: 'j3', status: 'failed', error: "Frame 0 isn't pictured yet" })
    vi.mocked(api.listJobs).mockResolvedValue([job({ status: 'running' }), failed])
    vi.mocked(api.cancelJob).mockResolvedValue([failed])
    const { wrapper } = await mountIt()
    const tab = wrapper.find('[data-tab=queue]')
    expect(tab.text()).toBe('Queue (1)')
    await tab.trigger('click')
    const items = wrapper.findAll('[data-queue-item]')
    expect(items.map((i) => i.text())).toEqual([
      expect.stringContaining('Picture · Frame 0'),
      expect.stringContaining("Failed: Frame 0 isn't pictured yet"),
    ])

    const reply = wrapper.find('[data-frame-index="0"]').element as HTMLElement
    reply.scrollIntoView = vi.fn()
    await items[0].find('button').trigger('click')
    expect(reply.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(wrapper.find('[data-frame-index="0"]').classes()).toContain('ring-2')

    await items[0].findAll('button')[1].trigger('click')
    await flushPromises()
    expect(api.cancelJob).toHaveBeenCalledWith('r1', 'j1')
    expect(wrapper.findAll('[data-queue-item]')).toHaveLength(1)

    // A failed job can be retried, from the queue or from its Frame.
    vi.mocked(api.retryJob).mockResolvedValue([job({ id: 'j3' })])
    await wrapper.find('[data-queue-item] [data-retry]').trigger('click')
    await flushPromises()
    expect(api.retryJob).toHaveBeenCalledWith('r1', 'j3')
    expect(wrapper.find('[data-queue-item]').text()).toContain('Queued')
    expect(wrapper.find('[data-frame-job] [data-retry]').exists()).toBe(false)
  })

  it("hides what's off: voices, pictures and SHARP here, keeping TripoSplat", async () => {
    const off = (reason: string) => ({ available: false, reason })
    vi.mocked(api.getSettingsOptions).mockResolvedValue({
      features: { ...ALL_AVAILABLE, voices: off('mlx-audio'), images: off('mflux') },
    } as api.SettingsOptions)
    vi.mocked(api.getSettings).mockResolvedValue({
      features: { ...ALL_ON, scenes: false },
    } as api.Settings)
    await useFeatures().refreshFeatures()
    const rendered = { ...frame(0, null, 'Get inside.'), image: 'frame-0-aaaaaaaa.png' }
    vi.mocked(api.getSession).mockResolvedValue(roleplaySession([rendered]))
    const { wrapper } = await mountIt()
    for (
      const gone of [
        '[data-autoplay]',
        '[data-picture-replies]',
        '[data-render-replies]',
        '[data-listen]',
        '[data-picture-button]',
        '[data-render-button]',
        '[data-upscale-button]',
        '[data-scene-button]',
        'form[data-voice]',
      ]
    ) {
      expect([gone, wrapper.find(gone).exists()]).toEqual([gone, false])
    }
    expect(wrapper.find('[data-figure-button]').exists()).toBe(true)
    // The picture it already has still opens.
    expect(wrapper.find('[data-picture-image]').exists()).toBe(true)
    // Everything back on, for the other tests.
    vi.mocked(api.getSettingsOptions).mockResolvedValue(
      { features: ALL_AVAILABLE } as api.SettingsOptions,
    )
    vi.mocked(api.getSettings).mockResolvedValue({ features: ALL_ON } as api.Settings)
    await useFeatures().refreshFeatures()
  })

  it('offers each picture in 3D by model: SHARP for the scene, TripoSplat and LiTo for the person', async () => {
    const rendered = { ...frame(0, null, 'Get inside.'), image: 'frame-0-aaaaaaaa.png' }
    vi.mocked(api.getSession).mockResolvedValue(roleplaySession([rendered]))
    vi.mocked(api.queueJob).mockResolvedValue([
      job({ kind: 'scene', status: 'running', phase: 'image' }),
    ])
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-scene-button]').text()).toBe('SHARP')
    expect(wrapper.find('[data-figure-button]').text()).toBe('TripoSplat')
    expect(wrapper.find('[data-lito-button]').text()).toBe('LiTo')
    await wrapper.find('[data-scene-button]').trigger('click')
    await flushPromises()
    expect(api.queueJob).toHaveBeenCalledWith('r1', 'scene', 0)
    expect(wrapper.find('[data-frame-job]').text()).toContain('SHARP · Making the 2.5D scene…')
    expect(wrapper.find('[data-scene-button]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-figure-button]').trigger('click')
    expect(api.queueJob).toHaveBeenLastCalledWith('r1', 'figure', 0)
    await wrapper.find('[data-lito-button]').trigger('click')
    expect(api.queueJob).toHaveBeenLastCalledWith('r1', 'lito', 0)
    wrapper.unmount()

    // Once made, each is viewed; a scene made before the upscale can be made again from it.
    const scene = {
      file: 'scene-0-bbbbbbbb.ply',
      from: rendered.image,
      splats: 9,
      pivot: 1.2,
      fov: 54,
      aspect: 1,
      timings: { scene: 6 },
    }
    const figure = {
      file: 'figure-0-cccccccc.ply',
      from: rendered.image,
      splats: 8,
      timings: { figure: 70 },
    }
    vi.mocked(api.getSession).mockResolvedValue(
      roleplaySession([{
        ...rendered,
        upscaled: 'frame-0-aaaaaaaa-2048.png',
        scene,
        figure,
        lito: { ...figure, file: 'lito-0-dddddddd.ply' },
      }]),
    )
    vi.mocked(api.listJobs).mockResolvedValue([])
    const again = (await mountIt()).wrapper
    expect(again.find('[data-scene-button]').text()).toBe('SHARP again from upscale')
    expect(again.find('[data-figure-button]').exists()).toBe(false)
    await again.find('[data-view-scene]').trigger('click')
    await flushPromises()
    const viewers = () => again.findAll('[data-scene-viewer]')
    expect(viewers()[0].text()).toContain('Frame 0 · SHARP, 2.5D')
    expect(viewers()[0].text()).toContain("Couldn't show the scene")
    await again.find('[data-view-figure]').trigger('click')
    await flushPromises()
    expect(viewers()[1].text()).toContain('Frame 0 · TripoSplat, 3D')
    expect(again.find('[data-lito-button]').exists()).toBe(false)
    await again.find('[data-view-lito]').trigger('click')
    await flushPromises()
    expect(viewers()[1].text()).toContain('Frame 0 · LiTo, 3D')
  })

  it('steps through the rendered Frames in the viewer, scrolling the conversation to each', async () => {
    const withImage = (index: number, message: string | null) => ({
      ...frame(index, message, `Line ${index}.`),
      image: `frame-${index}-aaaaaaaa.png`,
    })
    vi.mocked(api.getSession).mockResolvedValue(
      roleplaySession([withImage(0, null), frame(1, 'Hi.', 'No picture.'), withImage(2, 'Go.')]),
    )
    const { wrapper } = await mountIt()
    const last = wrapper.find('[data-frame-index="0"]').element as HTMLElement
    last.scrollIntoView = vi.fn()
    await wrapper.findAll('[data-picture-image]')[1].trigger('click')
    await flushPromises()
    const viewer = () => wrapper.find('[data-image-viewer]')
    expect(viewer().find('[data-viewer-label]').text()).toBe('Frame 2 · 2 of 2')
    expect(viewer().find('[data-next]').attributes('disabled')).toBeDefined()

    // ← skips Frame 1, which has no picture.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await flushPromises()
    await flushPromises()
    expect(viewer().find('[data-viewer-label]').text()).toBe('Frame 0 · 1 of 2')
    expect(viewer().find('[data-image-frame] img').attributes('src')).toBe(
      '/api/sessions/r1/images/frame-0-aaaaaaaa.png',
    )
    expect(last.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
  })
})
