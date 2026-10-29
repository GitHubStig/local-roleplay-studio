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

  it('lists the clips made, to play or to put back in the form', async () => {
    const wrapper = mountIt({ clips: [leadIn] })
    const row = wrapper.find('[data-clip="lead-in"]')
    expect(row.text()).toContain('4 s · with speech')
    await row.find('[data-play-clip]').trigger('click')
    expect(wrapper.emitted('play')).toEqual([[leadIn]])
    await wrapper.find('[data-clip-kind="idle-loop"]').trigger('click')
    await row.find('[data-clip-again]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-clip-kind="lead-in"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.find<HTMLTextAreaElement>('[data-clip-prompt]').element.value).toBe(
      'She walks in.',
    )
    expect((wrapper.find('[data-clip-speech]').element as HTMLInputElement).checked).toBe(true)
  })

  it("rewrites a clip's prompt by what was wrong with it, into the form", async () => {
    const wrapper = mountIt({ clips: [leadIn] })
    await wrapper.find('[data-clip-kind="idle-loop"]').trigger('click')
    await wrapper.find('[data-clip-wrong]').trigger('click')
    await wrapper.find('[data-clip-problem] textarea').setValue('She should stay at the table.')
    await wrapper.find('[data-clip-problem]').trigger('submit')
    await flushPromises()
    expect(api.writeClipPrompt).toHaveBeenCalledWith(
      's1',
      1,
      { kind: 'lead-in', seconds: 4, speech: true },
      expect.any(Function),
      { prompt: 'She walks in.', problem: 'She should stay at the table.' },
    )
    expect(wrapper.find<HTMLTextAreaElement>('[data-clip-prompt]').element.value).toBe(
      'She steps in. Sound: rain.',
    )
    expect(wrapper.find('[data-clip-problem]').exists()).toBe(false)
  })

  it('waits while a clip of the Frame is being made, saying which', () => {
    expect(mountIt({ making: ['lead-in'] }).find('[data-make-clip]').text()).toBe('Making Lead In…')
    const two = mountIt({ making: ['lead-in', 'idle-loop'] }).find('[data-make-clip]')
    expect([two.text(), two.attributes('disabled')]).toEqual(['Making Lead In, Idle Loop…', ''])
  })
})
