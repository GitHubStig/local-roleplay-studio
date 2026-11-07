import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveLine } from '../composables/useAutosave'
import * as roleplay from './api'
import MusicTab from './MusicTab.vue'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof roleplay>()),
  writeScore: vi.fn(),
  saveScore: vi.fn(),
  saveMusicSettings: vi.fn(),
}))

const score: roleplay.Score = {
  genre: 'dark folk',
  palette: ['fiddle', 'cello'],
  atmosphere: 'Close and cold.',
  tempo: { slowest: 50, fastest: 90 },
  avoid: ['synthesizers'],
}

const session = (extra: Partial<roleplay.RoleplaySession> = {}): roleplay.RoleplaySession => ({
  id: 'r1',
  kind: 'roleplay',
  brief: 'A lighthouse in a storm.',
  scenarioId: null,
  settings: {
    textModel: 'x',
    thinking: false,
    imageModel: 'qwen-image-2.1',
    steps: 8,
    musicBehaviour: 'cinematic',
    musicVocals: 'wordless',
    musicTaste: 'Strings.',
  },
  seed: 1,
  createdAt: '2026-11-06T00:00:00.000Z',
  cast: {} as roleplay.Cast,
  frames: [],
  ...extra,
})

function mountIt(s = session()) {
  return mount(MusicTab, { props: { session: s, line: saveLine(), frame: null } })
}

beforeEach(() => {
  vi.mocked(roleplay.writeScore).mockReset()
  vi.mocked(roleplay.saveScore).mockReset()
  vi.mocked(roleplay.saveMusicSettings).mockReset()
})
enableAutoUnmount(afterEach)

describe('MusicTab', () => {
  it('writes the Score when asked, and shows it to edit', async () => {
    const written = session({ score, scoreTimings: { text: 2.5 }, scoreModel: 'gemma' })
    vi.mocked(roleplay.writeScore).mockImplementation((_id, onEvent) => {
      onEvent({ type: 'score', score, session: written })
      return Promise.resolve()
    })
    const wrapper = mountIt()
    expect(wrapper.find('[data-score-form]').exists()).toBe(false)
    await wrapper.find('[data-write-score]').trigger('click')
    await flushPromises()
    expect(roleplay.writeScore).toHaveBeenCalledWith('r1', expect.any(Function))
    expect(wrapper.emitted('saved')![0]).toEqual([written])

    await wrapper.setProps({ session: written })
    expect(wrapper.find('[data-write-score]').text()).toBe('Write again')
    expect(wrapper.find('[data-score-timings]').text()).toBe('Written in 2.5 s by gemma')
    expect((wrapper.find('[data-score-genre]').element as HTMLInputElement).value).toBe('dark folk')
  })

  it('saves an edited Score when the focus leaves it, trimmed', async () => {
    const s = session({ score })
    vi.mocked(roleplay.saveScore).mockImplementation((_id, edited) =>
      Promise.resolve(session({ score: edited }))
    )
    const wrapper = mountIt(s)
    await wrapper.find('[data-score-genre]').setValue(' sea shanties ')
    await wrapper.find('[data-score-form]').trigger('focusout')
    await flushPromises()
    expect(roleplay.saveScore).toHaveBeenCalledWith('r1', { ...score, genre: 'sea shanties' })
  })

  it('holds back a Score with no genre, saying why', async () => {
    const wrapper = mountIt(session({ score }))
    await wrapper.find('[data-score-genre]').setValue(' ')
    await wrapper.find('[data-score-form]').trigger('focusout')
    await flushPromises()
    expect(roleplay.saveScore).not.toHaveBeenCalled()
    expect(wrapper.find('[data-score] [role="alert"]').text()).toContain('needs a genre')
  })

  it("shows the Roleplay's own music settings, and saves a change", async () => {
    vi.mocked(roleplay.saveMusicSettings).mockResolvedValue(session())
    const wrapper = mountIt()
    const checked = (part: string) =>
      (wrapper.findAll(`[data-music-${part}] input`).find((i) =>
        (i.element as HTMLInputElement).checked
      )!
        .element as HTMLInputElement).value
    expect([checked('behaviour'), checked('vocals')]).toEqual(['cinematic', 'wordless'])
    await wrapper.findAll('[data-music-behaviour] input')[0].setValue(true)
    await flushPromises()
    expect(roleplay.saveMusicSettings).toHaveBeenCalledWith('r1', {
      behaviour: 'steady',
      vocals: 'wordless',
      taste: 'Strings.',
    })
  })

  it('saves the taste before writing the Score, which is written from it', async () => {
    const calls: string[] = []
    vi.mocked(roleplay.saveMusicSettings).mockImplementation(() => {
      calls.push('taste')
      return Promise.resolve(session())
    })
    vi.mocked(roleplay.writeScore).mockImplementation(() => {
      calls.push('score')
      return Promise.resolve()
    })
    const wrapper = mountIt()
    await wrapper.find('[data-music-settings] textarea').setValue('No synths.')
    await wrapper.find('[data-write-score]').trigger('click')
    await flushPromises()
    expect(calls).toEqual(['taste', 'score'])
  })

  it("shows how a Frame's music was directed, flagging an instrument the Score has lost", async () => {
    const music = (decision: 'continue' | 'transition', cue: string, line = '') => ({
      cue,
      reading: 'She knows him now.',
      decision,
      entry: 'sharp' as const,
      line,
      model: 'gemma',
      timings: { text: 1.25 },
    })
    const frame = (index: number, m: ReturnType<typeof music>): roleplay.RoleplayFrame => ({
      index,
      message: index ? 'Hi.' : null,
      reply: { internal: '', actions: '', dialogue: '' },
      pictures: [],
      createdAt: '',
      music: m,
    })
    const values = {
      mood: 'recognition, aching',
      energy: 'building' as const,
      density: 'layered' as const,
      tempo: 'slow' as const,
      instruments: ['cello', 'harp'],
      vocals: 'none' as const,
    }
    const frames = [
      frame(0, music('transition', 'a')),
      frame(1, music('continue', 'a')),
      frame(2, music('transition', 'b', 'Father?')),
    ]
    const s = session({
      score,
      frames,
      cues: [
        { id: 'a', start: 0, entry: 'gentle', reading: '', line: '' },
        {
          id: 'b',
          start: 2,
          values,
          entry: 'sharp',
          reading: 'She knows him now.',
          line: 'Father?',
        },
      ],
    })
    const wrapper = mount(MusicTab, { props: { session: s, line: saveLine(), frame: frames[2] } })
    expect(wrapper.find('[data-decision]').text()).toBe('The music changes sharply')
    expect(wrapper.find('[data-line]').text()).toBe('Father?')
    expect(wrapper.find('[data-reading]').text()).toBe('She knows him now.')
    expect(wrapper.find('[data-frame-cue]').text()).toContain('recognition, aching')
    // The harp isn't among the Score's instruments: flagged, not refused.
    expect(wrapper.findAll('[data-outside]').map((i) => i.text())).toEqual([
      'harp (not in the Score)',
    ])
    // A silence of two Frames, then a Cue of one.
    expect(wrapper.findAll('[data-cue]').map((c) => c.attributes('style'))).toEqual([
      'flex-grow: 2;',
      'flex-grow: 1;',
    ])
    expect(wrapper.find('[data-cue-counts]').text()).toMatch(/1 Cue\s+and 1 silence/)
    expect(wrapper.find('[data-cue-counts]').text()).toMatch(/1 continued, 2 changed/)

    await wrapper.find('[data-direct]').trigger('click')
    expect(wrapper.emitted('direct')![0]).toEqual([2])
    await wrapper.find('[data-cue="a"]').trigger('click')
    expect(wrapper.emitted('go')![0]).toEqual([0])
  })

  it('shows a Frame scored with hindsight: no reading where the music continues, and its stinger', () => {
    const frame: roleplay.RoleplayFrame = {
      index: 1,
      message: 'Hi.',
      reply: { internal: '', actions: '', dialogue: '' },
      pictures: [],
      createdAt: '',
      music: {
        cue: 'a',
        reading: '',
        decision: 'continue',
        entry: 'gentle',
        line: '',
        model: 'gemma',
        timings: { text: 0 },
        hindsight: true,
        stinger: { reading: 'The blade comes out.', line: 'Hold still.' },
      },
    }
    const s = session({
      score,
      frames: [frame],
      cues: [{ id: 'a', start: 0, entry: 'gentle', reading: '', line: '' }],
      hindsight: {
        model: 'gemma',
        chunks: 1,
        courses: ['Small talk, then trust.'],
        timings: { text: 12 },
      },
    })
    const wrapper = mount(MusicTab, { props: { session: s, line: saveLine(), frame } })
    expect(wrapper.find('[data-decision]').text()).toBe('The music continues')
    expect(wrapper.find('[data-reading]').exists()).toBe(false)
    expect(wrapper.find('[data-stinger]').text()).toContain('Hold still.')
    expect(wrapper.find('[data-direct-timings]').text()).toBe('Scored with hindsight by gemma')
    expect(wrapper.find('[data-cue-counts]').text()).toMatch(/1 with a stinger/)
    expect(wrapper.find('[data-hindsight]').text()).toMatch(/in 12 s by\s+gemma, in 1\s+part/)
    expect(wrapper.find('[data-hindsight-course]').text()).toBe('Small talk, then trust.')
  })
})
