import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PicturedFrame } from '../api'
import ModelComparison from './ModelComparison.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getSettingsOptions: vi.fn(() => new Promise(() => {})),
}))

enableAutoUnmount(afterEach)

const picture = (image: string, imageModel: string) => ({ image, imageModel })

/** Frame 0 by both models, Frame 1 by the first only, Frame 2 not rendered. */
const frames: PicturedFrame[] = [
  { index: 0, pictures: [picture('f0-a.png', 'a'), picture('f0-b.png', 'b')] },
  { index: 1, pictures: [picture('f1-a.png', 'a')] },
  { index: 2, pictures: [] },
]

const mountIt = (shown = frames) =>
  mount(ModelComparison, {
    props: { sessionId: 's1', frames: shown, imageModel: 'b' },
    attachTo: document.body,
  })

describe('ModelComparison', () => {
  it('offers Compare only once two Image Models have rendered', () => {
    expect(mountIt([frames[1]]).find('[data-compare-models]').exists()).toBe(false)
    expect(mountIt().find('[data-compare-models]').exists()).toBe(true)
  })

  it('shows a row per pictured Frame and a column per model, gaps where none rendered', async () => {
    const wrapper = mountIt()
    await wrapper.find('[data-compare-models]').trigger('click')
    await flushPromises()
    expect((wrapper.find('[data-model-comparison]').element as HTMLDialogElement).open).toBe(true)
    expect(wrapper.findAll('[data-model-column]').map((c) => c.text())).toEqual([
      'a',
      'b · current',
    ])
    const rows = wrapper.findAll('[data-compare-row]')
    expect(rows).toHaveLength(2)
    expect(rows[0].findAll('img').map((i) => i.attributes('src'))).toEqual([
      '/api/sessions/s1/images/f0-a.png',
      '/api/sessions/s1/images/f0-b.png',
    ])
    expect(rows[1].findAll('img')).toHaveLength(1)
    expect(rows[1].text()).toContain('Not rendered')
  })

  it('steps through one Frame’s pictures by each model in the viewer', async () => {
    const wrapper = mountIt()
    await wrapper.find('[data-compare-models]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-compare-row] button').trigger('click')
    await flushPromises()
    const label = () => wrapper.find('[data-viewer-label]').text()
    expect(label()).toBe('Frame 0 · a · ↑↓ Frames')
    await wrapper.find('[data-next]').trigger('click')
    expect(label()).toBe('Frame 0 · b · ↑↓ Frames')
    expect(wrapper.find('[data-next]').attributes('disabled')).toBeDefined()
  })

  it('moves between Frames by the same model with ↑ and ↓, past Frames it didn’t render', async () => {
    const shown: PicturedFrame[] = [
      ...frames.slice(0, 2),
      { index: 2, pictures: [picture('f2-a.png', 'a'), picture('f2-b.png', 'b')] },
    ]
    const wrapper = mountIt(shown)
    await wrapper.find('[data-compare-models]').trigger('click')
    await flushPromises()
    // Frame 0 by b.
    await wrapper.findAll('[data-compare-row] button')[1].trigger('click')
    await flushPromises()
    const label = () => wrapper.find('[data-viewer-label]').text()
    const press = async (key: string) => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key }))
      await flushPromises()
    }
    await press('ArrowDown')
    expect(label()).toBe('Frame 2 · b · ↑↓ Frames')
    await press('ArrowDown')
    expect(label()).toBe('Frame 2 · b · ↑↓ Frames')
    await press('ArrowUp')
    expect(label()).toBe('Frame 0 · b · ↑↓ Frames')
  })
})
