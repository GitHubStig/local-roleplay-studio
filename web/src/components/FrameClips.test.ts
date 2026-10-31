import { flushPromises, mount } from '@vue/test-utils'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { useFeatures } from '../composables/useFeatures'
import FrameClips from './FrameClips.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  writeClipPrompt: vi.fn(),
  getSettings: vi.fn(() => Promise.resolve({ videoModel: 'ltx-2.5' } as api.Settings)),
  getSettingsOptions: vi.fn(() =>
    Promise.resolve({
      videoModels: [
        { id: 'ltx-2.5', label: 'LTX 2.5', sound: true },
        { id: 'wan-2.2', label: 'Wan 2.2 14B', sound: false },
        { id: 'minimax-h3', label: 'MiniMax H3', sound: true },
      ],
    } as api.SettingsOptions)
  ),
}))

const leadIn: api.Clip = {
  kind: 'lead-in',
  model: 'ltx-2.5',
  prompt: 'She walks in.',
  seconds: 4,
  speech: true,
  file: 'clip-1-lead-in-1a2b3c4d.mp4',
  seed: 7,
  timings: { clip: 140 },
}
const mountIt = (props: Partial<InstanceType<typeof FrameClips>['$props']> = {}) =>
  mount(FrameClips, {
    props: {
      sessionId: 's1',
      index: 1,
      nextPictured: true,
      nextName: 'Frame 2',
      making: [],
      ...props,
    },
  })

beforeAll(() => useFeatures().refreshFeatures())

beforeEach(() => {
  // The video model last picked in a Session is remembered in this browser.
  localStorage.clear()
  vi.mocked(api.writeClipPrompt).mockReset().mockImplementation(
    async (_id, _index, _ask, onEvent) => {
      onEvent({ type: 'clip-prompt-part', text: 'She ' })
      onEvent({ type: 'clip-prompt', text: 'She steps in. Sound: rain.' })
    },
  )
})

describe('FrameClips', () => {
  it('has the Text Model write the prompt for the kind, length and speech, then makes it as edited', async () => {
    const wrapper = mountIt()
    await wrapper.find('[data-clip-kind="idle-loop"]').trigger('click')
    await wrapper.find('[data-clip-seconds]').setValue('8')
    await wrapper.find('[data-clip-speech]').setValue(true)
    expect(wrapper.find('[data-make-clip]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-write-clip-prompt]').trigger('click')
    await flushPromises()
    expect(api.writeClipPrompt).toHaveBeenCalledWith(
      's1',
      1,
      { kind: 'idle-loop', seconds: 8, speech: true },
      expect.any(Function),
      undefined,
    )
    const prompt = wrapper.find<HTMLTextAreaElement>('[data-clip-prompt]')
    expect(prompt.element.value).toBe('She steps in. Sound: rain.')
    await prompt.setValue('She sits still. Sound: rain.')
    await wrapper.find('[data-make-clip]').trigger('click')
    expect(wrapper.emitted('make')).toEqual([[
      {
        kind: 'idle-loop',
        prompt: 'She sits still. Sound: rain.',
        seconds: 8,
        speech: true,
        model: 'ltx-2.5',
      },
    ]])
  })

  it('says why a prompt failed, and clears one written for another kind', async () => {
    vi.mocked(api.writeClipPrompt).mockImplementationOnce(async (_id, _index, _ask, onEvent) => {
      onEvent({
        type: 'failed',
        message: 'A Frame is already in progress',
        sessionDiscarded: false,
      })
    })
    const wrapper = mountIt()
    await wrapper.find('[data-write-clip-prompt]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('A Frame is already in progress')
    await wrapper.find('[data-write-clip-prompt]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-clip-kind="play-out"]').trigger('click')
    expect(wrapper.find<HTMLTextAreaElement>('[data-clip-prompt]').element.value).toBe('')
  })

  it('offers Into Next only with a next picture, and warns what it needs', async () => {
    const without = mountIt({ nextPictured: false })
    expect(without.find('[data-clip-kind="into-next"]').attributes('disabled')).toBeDefined()
    const withNext = mountIt()
    await withNext.find('[data-clip-kind="into-next"]').trigger('click')
    expect(withNext.find('[data-into-next-warning]').text()).toContain('Lead In on Frame 2')
  })

  it("fills the form from a kind's clip, to Redo it, and empties it for a kind not made", async () => {
    const wrapper = mountIt({ clips: [leadIn] })
    const prompt = () => wrapper.find<HTMLTextAreaElement>('[data-clip-prompt]').element.value
    const make = () => wrapper.find('[data-make-clip]')
    // Lead In is chosen to begin with, and has a clip: its order is in the form.
    expect([prompt(), make().text()]).toEqual(['She walks in.', 'Redo clip'])
    expect((wrapper.find('[data-clip-speech]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.find('[data-clip-seconds]').element as HTMLSelectElement).value).toBe('4')
    await wrapper.find('[data-clip-kind="idle-loop"]').trigger('click')
    expect([prompt(), make().text()]).toEqual(['', 'Make clip'])
    await wrapper.find('[data-clip-kind="lead-in"]').trigger('click')
    await wrapper.find('[data-clip-prompt]').setValue('She runs in.')
    await make().trigger('click')
    expect(wrapper.emitted('make')).toEqual([[{
      kind: 'lead-in',
      prompt: 'She runs in.',
      seconds: 4,
      speech: true,
      model: 'ltx-2.5',
    }]])
    expect(wrapper.find('[data-clip-again]').exists()).toBe(false)
  })

  it('plays a clip, then stops it from the same button', async () => {
    const wrapper = mountIt({ clips: [leadIn], playing: leadIn.file })
    const play = wrapper.find('[data-play-clip]')
    expect([play.text(), play.attributes('aria-pressed')]).toEqual(['Stop', 'true'])
    await play.trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
    expect(wrapper.emitted('play')).toBeUndefined()
  })

  it('shows the clip in the form with Change it, the focus on the box', async () => {
    const wrapper = mount(FrameClips, {
      props: {
        sessionId: 's1',
        index: 1,
        nextPictured: true,
        nextName: 'Frame 2',
        making: [],
        clips: [leadIn],
      },
      attachTo: document.body,
    })
    await wrapper.find('[data-clip-kind="idle-loop"]').trigger('click')
    await wrapper.find('[data-clip-wrong]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-clip-kind="lead-in"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.find<HTMLTextAreaElement>('[data-clip-prompt]').element.value).toBe(
      'She walks in.',
    )
    expect(document.activeElement).toBe(wrapper.find('[data-clip-change] input').element)
    wrapper.unmount()
  })

  it('rewrites the prompt in the box, edits and all, by what should change, then undoes it', async () => {
    const wrapper = mountIt({ clips: [leadIn] })
    await wrapper.find('[data-clip-kind="idle-loop"]').trigger('click')
    expect(wrapper.find('[data-clip-change]').exists()).toBe(false)
    await wrapper.find('[data-clip-kind="lead-in"]').trigger('click')
    await wrapper.find('[data-clip-prompt]').setValue('She walks in, hurrying.')
    await wrapper.find('[data-clip-change] input').setValue('She should stay at the table.')
    await wrapper.find('[data-clip-change]').trigger('submit')
    await flushPromises()
    expect(api.writeClipPrompt).toHaveBeenCalledWith(
      's1',
      1,
      { kind: 'lead-in', seconds: 4, speech: true },
      expect.any(Function),
      { prompt: 'She walks in, hurrying.', problem: 'She should stay at the table.' },
    )
    const box = () => wrapper.find<HTMLTextAreaElement>('[data-clip-prompt]').element
    expect(box().value).toBe('She steps in. Sound: rain.')
    expect(wrapper.find<HTMLInputElement>('[data-clip-change] input').element.value).toBe('')
    await wrapper.find('[data-undo-rewrite]').trigger('click')
    expect(box().value).toBe('She walks in, hurrying.')
    expect(wrapper.find('[data-undo-rewrite]').exists()).toBe(false)
  })

  it('waits while the kind chosen is being made, the other kinds free meanwhile', async () => {
    const wrapper = mountIt({ making: [{ kind: 'lead-in' }, { kind: 'idle-loop' }] })
    const make = () => wrapper.find('[data-make-clip]')
    expect([make().text(), make().attributes('disabled')]).toEqual(['Making Lead In…', ''])
    expect(wrapper.find('[data-clips-making]').text()).toBe(
      'Making Idle Loop by LTX 2.5 meanwhile.',
    )
    await wrapper.find('[data-clip-kind="play-out"]').trigger('click')
    await wrapper.find('[data-clip-prompt]').setValue('She stands.')
    expect([make().text(), make().attributes('disabled')]).toEqual(['Make clip', undefined])
    expect(wrapper.find('[data-clips-making]').text()).toBe(
      'Making Lead In by LTX 2.5, Idle Loop by LTX 2.5 meanwhile.',
    )
  })

  it('lists the clips in the order the kinds are offered', () => {
    const loop = { ...leadIn, kind: 'idle-loop' as const, file: 'clip-1-idle-loop-1a2b3c4d.mp4' }
    const out = { ...leadIn, kind: 'play-out' as const, file: 'clip-1-play-out-1a2b3c4d.mp4' }
    const wrapper = mountIt({ clips: [out, loop, leadIn] })
    expect(wrapper.findAll('[data-clip]').map((r) => r.attributes('data-clip'))).toEqual([
      'lead-in',
      'idle-loop',
      'play-out',
    ])
    expect(wrapper.findAll('[data-clip-kind]').map((b) => b.text())).toEqual([
      'Lead In',
      'Idle Loop',
      'Play out',
      'Into Next',
    ])
  })

  it('asks for no speech from a video model that makes no sound, and doesn’t offer it', async () => {
    const wrapper = mountIt({ clips: [leadIn] })
    await wrapper.find('[data-clip-model]').setValue('wan-2.2')
    expect(wrapper.find('[data-clip-speech]').exists()).toBe(false)
    await wrapper.find('[data-write-clip-prompt]').trigger('click')
    await flushPromises()
    expect(vi.mocked(api.writeClipPrompt).mock.calls[0][2]).toEqual({
      kind: 'lead-in',
      seconds: 4,
      speech: false,
    })
  })

  it('keeps a clip of a kind per video model: another model starts from its prompt, to compare', async () => {
    const wrapper = mountIt({ clips: [leadIn] })
    const make = () => wrapper.find('[data-make-clip]')
    const box = () => wrapper.find<HTMLTextAreaElement>('[data-clip-prompt]').element
    expect([box().value, make().text()]).toEqual(['She walks in.', 'Redo clip'])
    // H3 has no Lead In yet: the same prompt, to make a clip of its own beside LTX's.
    await wrapper.find('[data-clip-model]').setValue('minimax-h3')
    expect([box().value, make().text()]).toEqual(['She walks in.', 'Make clip'])
    await make().trigger('click')
    expect(wrapper.emitted('make')?.[0][0]).toMatchObject({ kind: 'lead-in', model: 'minimax-h3' })
    // Remembered for the Session, in this browser.
    expect(mountIt().find<HTMLSelectElement>('[data-clip-model]').element.value).toBe('minimax-h3')
    expect(mountIt({ sessionId: 's2' }).find<HTMLSelectElement>('[data-clip-model]').element.value)
      .toBe('ltx-2.5')
  })

  it('waits only while the same model makes the kind chosen', async () => {
    const wrapper = mountIt({ making: [{ kind: 'lead-in', model: 'wan-2.2' }] })
    expect(wrapper.find('[data-make-clip]').text()).toBe('Make clip')
    expect(wrapper.find('[data-clips-making]').text()).toBe(
      'Making Lead In by Wan 2.2 14B meanwhile.',
    )
    await wrapper.find('[data-clip-model]').setValue('wan-2.2')
    expect(wrapper.find('[data-make-clip]').text()).toBe('Making Lead In…')
  })

  it('lists each kind’s clips by model, with Compare once two models have made it', async () => {
    const byWan = { ...leadIn, model: 'wan-2.2', file: 'clip-1-lead-in-2b3c4d5e.mp4' }
    const loop = { ...leadIn, kind: 'idle-loop' as const, file: 'clip-1-idle-loop-1a2b3c4d.mp4' }
    const wrapper = mountIt({ clips: [leadIn, loop, byWan] })
    const lead = wrapper.find('[data-clip="lead-in"]')
    expect(lead.findAll('[data-clip-by]').map((r) => r.text().split(' · ').slice(0, 1).join()))
      .toEqual([
        'LTX 2.5',
        'Wan 2.2 14B',
      ])
    expect(lead.find('[data-clip-by="wan-2.2"]').text()).toContain('no sound')
    expect(wrapper.find('[data-clip="idle-loop"] [data-compare-clips]').exists()).toBe(false)
    await lead.find('[data-compare-clips]').trigger('click')
    const compared = wrapper.findAll('[data-clip-compare] [data-compared]')
    expect(compared.map((f) => f.attributes('data-compared'))).toEqual(['ltx-2.5', 'wan-2.2'])
    // Change it on Wan's puts Wan's order back in the form.
    await lead.find('[data-clip-by="wan-2.2"] [data-clip-wrong]').trigger('click')
    expect(wrapper.find<HTMLSelectElement>('[data-clip-model]').element.value).toBe('wan-2.2')
  })
})
