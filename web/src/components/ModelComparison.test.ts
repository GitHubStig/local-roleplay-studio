import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportComparison, type PicturedFrame } from '../api'
import ModelComparison from './ModelComparison.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getSettingsOptions: vi.fn(() => new Promise(() => {})),
  exportComparison: vi.fn(() => Promise.resolve({ folder: '/exports/s1', pictures: 3 })),
}))

enableAutoUnmount(afterEach)

const picture = (image: string, imageModel: string) => ({ image, imageModel })

/** Frame 0 (with its Image Prompt) by both models, Frame 1 by the first only, Frame 2 not rendered. */
const frames: PicturedFrame[] = [
  {
    index: 0,
    prompt: 'A tavern at dusk.',
    pictures: [picture('f0-a.png', 'a'), picture('f0-b.png', 'b')],
  },
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
    expect(rows[0].find('[data-compare-prompt]').text()).toBe('A tavern at dusk.')
    expect(rows[1].find('[data-compare-prompt]').exists()).toBe(false)
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
    expect(label()).toBe('Frame 0 · a')
    await wrapper.find('[data-next]').trigger('click')
    expect(label()).toBe('Frame 0 · b')
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
    expect(label()).toBe('Frame 2 · b')
    await press('ArrowDown')
    expect(label()).toBe('Frame 2 · b')
    await press('ArrowUp')
    expect(label()).toBe('Frame 0 · b')
  })

  it('exports what it shows, by the pictures’ files, and says where it went', async () => {
    const shown: PicturedFrame[] = [
      {
        ...frames[0],
        pictures: [
          { ...picture('f0-a.png', 'a'), upscaled: 'f0-a-2048.png' },
          frames[0].pictures[1],
        ],
      },
      frames[1],
    ]
    const wrapper = mountIt(shown)
    await wrapper.find('[data-compare-models]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-export]').trigger('click')
    // It asks first: no 18+ notice unless ticked.
    expect(wrapper.find('[data-notice]').exists()).toBe(false)
    await wrapper.find('[data-export-options] form').trigger('submit')
    await flushPromises()
    expect(exportComparison).toHaveBeenCalledWith('s1', {
      models: [{ label: 'a' }, { label: 'b' }],
      rows: [
        {
          name: 'Frame 0',
          prompt: 'A tavern at dusk.',
          pictures: [
            { image: 'f0-a.png', upscaled: 'f0-a-2048.png', stale: undefined },
            { image: 'f0-b.png', upscaled: undefined, stale: undefined },
          ],
        },
        {
          name: 'Frame 1',
          prompt: undefined,
          pictures: [{ image: 'f1-a.png', upscaled: undefined, stale: undefined }, null],
        },
      ],
    })
    expect(wrapper.find('[data-export-done]').text()).toBe('Exported to /exports/s1')
  })

  it('exports behind an 18+ notice when asked, remembering it for the Session', async () => {
    const shown: PicturedFrame[] = [
      { index: 0, pictures: [picture('f0-a.png', 'a'), picture('f0-b.png', 'b')] },
    ]
    const exportOnce = async () => {
      const wrapper = mountIt(shown)
      await wrapper.find('[data-compare-models]').trigger('click')
      await flushPromises()
      await wrapper.find('[data-export]').trigger('click')
      return wrapper
    }
    const sent = () => vi.mocked(exportComparison).mock.lastCall![1].notice

    let wrapper = await exportOnce()
    await wrapper.find('[data-adults-only]').setValue(true)
    const box = wrapper.find('[data-notice]').element as HTMLTextAreaElement
    expect(box.value).toBe('Some of these pictures show nude figures, as in classical painting.')
    await wrapper.find('[data-notice]').setValue('  Nude figures throughout.  ')
    await wrapper.find('[data-export-options] form').trigger('submit')
    await flushPromises()
    expect(sent()).toBe('Nude figures throughout.')
    wrapper.unmount()

    // Next time it's still ticked, with the same text; emptied, the default goes.
    wrapper = await exportOnce()
    expect((wrapper.find('[data-adults-only]').element as HTMLInputElement).checked).toBe(true)
    await wrapper.find('[data-notice]').setValue('')
    await wrapper.find('[data-export-options] form').trigger('submit')
    await flushPromises()
    expect(sent()).toBe('Some of these pictures show nude figures, as in classical painting.')
    localStorage.clear()
  })

  it('folds the prompts away and back, from the table’s corner', async () => {
    const wrapper = mountIt()
    await wrapper.find('[data-compare-models]').trigger('click')
    await flushPromises()
    const toggle = wrapper.find('[data-toggle-prompts]')
    expect(toggle.text()).toBe('‹ Hide prompts')
    await toggle.trigger('click')
    expect(wrapper.find('[data-compare-prompt]').exists()).toBe(false)
    expect(wrapper.find('[data-compare-row]').text()).toContain('Frame 0')
    expect(toggle.text()).toBe('Prompts ›')
    await toggle.trigger('click')
    expect(wrapper.find('[data-compare-prompt]').text()).toBe('A tavern at dusk.')
  })

  it('moves a column from its grip, and the viewer steps in the new order', async () => {
    const wrapper = mountIt()
    await wrapper.find('[data-compare-models]').trigger('click')
    await flushPromises()
    await wrapper.findAll('[data-move-column]')[1].trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.findAll('[data-model-column]').map((c) => c.text())).toEqual([
      'b · current',
      'a',
    ])
    const row = wrapper.find('[data-compare-row]')
    expect(row.findAll('img').map((i) => i.attributes('src'))).toEqual([
      '/api/sessions/s1/images/f0-b.png',
      '/api/sessions/s1/images/f0-a.png',
    ])
    await row.find('button').trigger('click')
    await flushPromises()
    const label = () => wrapper.find('[data-viewer-label]').text()
    expect(label()).toBe('Frame 0 · b')
    await wrapper.find('[data-next]').trigger('click')
    expect(label()).toBe('Frame 0 · a')
  })
})
