import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteModelPictures, exportComparison, type PicturedFrame } from '../api'
import ModelComparison from './ModelComparison.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getSettingsOptions: vi.fn(() => new Promise(() => {})),
  exportComparison: vi.fn(() => Promise.resolve({ folder: '/exports/s1', pictures: 3 })),
  // Not scored: an export carries no style scores.
  getStyleScores: vi.fn(() => Promise.reject(new Error('Not scored yet'))),
  deleteModelPictures: vi.fn(() => Promise.resolve({ session: {}, deleted: 2 })),
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

  it('compares an edited picture as its picked edit, marked with what it was told', async () => {
    const edited = {
      ...picture('f0-b.png', 'b'),
      edits: [{ image: 'edit-0-b.png', instructions: ['A hand'], editModel: 'e', seed: 1 }],
      picked: 1,
    }
    const wrapper = mountIt([{ ...frames[0], pictures: [frames[0].pictures[0], edited] }])
    await wrapper.find('[data-compare-models]').trigger('click')
    await flushPromises()
    const cells = wrapper.find('[data-compare-row]').findAll('td')
    expect(cells[1].find('img').attributes('src')).toBe('/api/sessions/s1/images/edit-0-b.png')
    expect(cells[1].find('[data-edited]').exists()).toBe(true)
    expect(cells[1].find('button').attributes('title')).toBe('Edited: A hand')
    expect(cells[0].find('[data-edited]').exists()).toBe(false)
  })

  it('steps through one Frame’s pictures by each model in the viewer', async () => {
    const wrapper = mountIt()
    await wrapper.find('[data-compare-models]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-compare-row] button').trigger('click')
    await flushPromises()
    const label = () => wrapper.find('[data-viewer-label]').text()
    expect(label()).toBe('Frame 1 · a')
    await wrapper.find('[data-next]').trigger('click')
    expect(label()).toBe('Frame 1 · b')
    expect(wrapper.find('[data-next]').attributes('disabled')).toBeDefined()
  })

  it('shows each Frame’s caption under its pictures in the viewer, room kept where there’s none', async () => {
    const wrapper = mount(ModelComparison, {
      props: {
        sessionId: 's1',
        frames,
        imageModel: 'b',
        caption: (f: PicturedFrame) => (f.index === 0 ? 'The tavern, at dusk.' : undefined),
      },
      attachTo: document.body,
    })
    await wrapper.find('[data-compare-models]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-compare-row] button').trigger('click')
    await flushPromises()
    const caption = () => wrapper.find('[data-viewer-caption]')
    expect(caption().text()).toBe('The tavern, at dusk.')
    // The same Frame by the other model: the same caption.
    await wrapper.find('[data-next]').trigger('click')
    expect(caption().text()).toBe('The tavern, at dusk.')
    await wrapper.find('[data-previous]').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await flushPromises()
    expect(wrapper.find('[data-viewer-label]').text()).toBe('Frame 2 · a')
    expect(caption().exists()).toBe(true)
    expect(caption().text()).toBe('')
  })

  it('shows no caption in the viewer when no Frame has one', async () => {
    const wrapper = mountIt()
    await wrapper.find('[data-compare-models]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-compare-row] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-viewer-caption]').exists()).toBe(false)
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
    expect(label()).toBe('Frame 3 · b')
    await press('ArrowDown')
    expect(label()).toBe('Frame 3 · b')
    await press('ArrowUp')
    expect(label()).toBe('Frame 1 · b')
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
          name: 'Frame 1',
          prompt: 'A tavern at dusk.',
          pictures: [
            { image: 'f0-a.png', upscaled: 'f0-a-2048.png', stale: undefined },
            { image: 'f0-b.png', upscaled: undefined, stale: undefined },
          ],
        },
        {
          name: 'Frame 2',
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
    expect(wrapper.find('[data-compare-row]').text()).toContain('Frame 1')
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
    expect(label()).toBe('Frame 1 · b')
    await wrapper.find('[data-next]').trigger('click')
    expect(label()).toBe('Frame 1 · a')
  })

  it('exports the columns as arranged, without the hidden ones, and keeps them on reopening', async () => {
    const wrapper = mountIt()
    const open = async () => {
      await wrapper.find('[data-compare-models]').trigger('click')
      await flushPromises()
    }
    const columns = () => wrapper.findAll('[data-model-column]').map((c) => c.text())
    await open()
    await wrapper.findAll('[data-move-column]')[1].trigger('keydown', { key: 'ArrowLeft' })
    expect(columns()).toEqual(['b · current', 'a'])

    // Hiding b moves it to the right end, folded to its header.
    await wrapper.findAll('[data-show-model]')[0].setValue(false)
    expect(columns()).toEqual(['a'])
    expect(wrapper.find('[data-hidden-column]').text()).toBe('b')
    expect(wrapper.find('[data-compare-row]').findAll('img')).toHaveLength(1)

    await wrapper.find('[data-export]').trigger('click')
    await wrapper.find('[data-export-options] form').trigger('submit')
    await flushPromises()
    expect(vi.mocked(exportComparison).mock.lastCall![1]).toMatchObject({
      models: [{ label: 'a' }],
      rows: [{ pictures: [{ image: 'f0-a.png' }] }, { pictures: [{ image: 'f1-a.png' }] }],
    })

    // Shown again, it comes back after the shown ones; the arrangement outlasts closing.
    await wrapper.find('[data-hidden-column] input').setValue(true)
    expect(columns()).toEqual(['a', 'b · current'])
    wrapper.find('dialog').element.dispatchEvent(new Event('close'))
    await flushPromises()
    await open()
    expect(columns()).toEqual(['a', 'b · current'])
    await wrapper.find('[data-export]').trigger('click')
    await wrapper.find('[data-export-options] form').trigger('submit')
    await flushPromises()
    expect(vi.mocked(exportComparison).mock.lastCall![1].models).toEqual([
      { label: 'a' },
      { label: 'b' },
    ])
  })

  it('remembers hidden columns for the Session, and deletes a hidden model’s pictures when asked', async () => {
    localStorage.clear()
    const open = async (wrapper: ReturnType<typeof mountIt>) => {
      await wrapper.find('[data-compare-models]').trigger('click')
      await flushPromises()
    }
    let wrapper = mountIt()
    await open(wrapper)
    await wrapper.findAll('[data-show-model]')[0].setValue(false)
    expect(localStorage.getItem('compare-hidden:s1')).toBe('["a"]')

    // Still hidden on the Session's next visit, and only a model other than the Session's own
    // offers to delete its pictures.
    wrapper.unmount()
    wrapper = mountIt()
    await open(wrapper)
    expect(wrapper.find('[data-hidden-column]').text()).toContain('a')
    await wrapper.find('[data-delete-model-pictures]').trigger('click')
    expect(wrapper.find('[data-delete-model-dialog]').text()).toContain('All 2 pictures a made')
    await wrapper.find('[data-delete-model-dialog] form').trigger('submit')
    await flushPromises()
    expect(deleteModelPictures).toHaveBeenCalledWith('s1', 'a')
    expect(wrapper.emitted('changed')).toHaveLength(1)

    await wrapper.find('[data-hidden-column] input').setValue(true)
    const columnB = wrapper.findAll('[data-model-column]').find((c) => c.text().startsWith('b'))!
    await columnB.find('[data-show-model]').setValue(false)
    expect(wrapper.find('[data-hidden-column]').text()).toBe('b')
    expect(wrapper.find('[data-delete-model-pictures]').exists()).toBe(false)
    localStorage.clear()
  })
})
