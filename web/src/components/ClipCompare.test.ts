import { flushPromises, mount } from '@vue/test-utils'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { useFeatures } from '../composables/useFeatures'
import ClipCompare from './ClipCompare.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
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

const clip = (kind: api.ClipKind, model: string): api.Clip => ({
  kind,
  model,
  file: `clip-0-${kind}-${model}.mp4`,
  prompt: 'He wipes the bar.',
  seconds: 5,
  speech: false,
  seed: 7,
  timings: { clip: 140 },
})
const clips = [
  clip('lead-in', 'ltx-2.5'),
  clip('idle-loop', 'wan-2.2'),
  clip('idle-loop', 'ltx-2.5'),
  clip('idle-loop', 'minimax-h3'),
  clip('lead-in', 'wan-2.2'),
  clip('play-out', 'ltx-2.5'),
]

beforeAll(() => useFeatures().refreshFeatures())

describe('ClipCompare', () => {
  it('shows each model’s clip of a kind, one heard at a time, and switches kind', async () => {
    const wrapper = mount(ClipCompare, { props: { sessionId: 's1', clips, kind: null } })
    expect(wrapper.find('[data-compared]').exists()).toBe(false)
    await wrapper.setProps({ kind: 'idle-loop' })
    await flushPromises()
    const panels = () => wrapper.findAll('[data-compared]')
    expect(panels().map((p) => p.attributes('data-compared'))).toEqual([
      'wan-2.2',
      'ltx-2.5',
      'minimax-h3',
    ])
    // Wan makes no sound, so the first that does is heard, and only it.
    const muted = () => panels().map((p) => p.find<HTMLVideoElement>('video').element.muted)
    expect(muted()).toEqual([true, false, true])
    expect(panels()[0].text()).toContain('no sound · made in 2:20')
    await panels()[0].find('button').trigger('click')
    expect(muted()).toEqual([true, false, true])
    await panels()[2].find('button').trigger('click')
    expect(muted()).toEqual([true, true, false])
    // Only kinds made by two models or more can be compared.
    const kinds = wrapper.findAll('[data-compare-kind]').map((b) =>
      b.attributes('data-compare-kind')
    )
    expect(kinds).toEqual(['lead-in', 'idle-loop'])
    await wrapper.find('[data-compare-kind="lead-in"]').trigger('click')
    expect(panels().map((p) => p.attributes('data-compared'))).toEqual(['ltx-2.5', 'wan-2.2'])
    expect(panels()[0].text()).toContain('LTX 2.5')
  })
})
