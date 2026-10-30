import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import FrameClips from './FrameClips.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  writeClipPrompt: vi.fn(),
}))

const leadIn: api.Clip = {
  kind: 'lead-in',
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

beforeEach(() => {
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
      { kind: 'idle-loop', prompt: 'She sits still. Sound: rain.', seconds: 8, speech: true },
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
    const wrapper = mountIt({ making: ['lead-in', 'idle-loop'] })
    const make = () => wrapper.find('[data-make-clip]')
    expect([make().text(), make().attributes('disabled')]).toEqual(['Making Lead In…', ''])
    expect(wrapper.find('[data-clips-making]').text()).toBe('Making Idle Loop meanwhile.')
    await wrapper.find('[data-clip-kind="play-out"]').trigger('click')
    await wrapper.find('[data-clip-prompt]').setValue('She stands.')
    expect([make().text(), make().attributes('disabled')]).toEqual(['Make clip', undefined])
    expect(wrapper.find('[data-clips-making]').text()).toBe('Making Lead In, Idle Loop meanwhile.')
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
})
