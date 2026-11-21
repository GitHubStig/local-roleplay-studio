import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import EditCompare from './EditCompare.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSettingsOptions: vi.fn(() =>
    Promise.resolve({
      editModels: [
        { id: 'qwen-image-2.1-edit', label: 'Qwen-Image 2.1 Edit' },
        { id: 'flux3-klein-edit', label: 'FLUX.3 Klein Edit' },
      ],
    } as unknown as api.SettingsOptions)
  ),
}))

const edit = (n: number, editModel: string): api.PictureEdit => ({
  file: `edit-0-0000000${n}.png`,
  instructions: [`Paint ${n}`],
  editModel,
  seed: n,
  mask: `mask-0-0000000${n}.png`,
})
/** Qwen's two edits, FLUX.3's one between them, Qwen's first picked. */
const picture: api.Picture = {
  file: 'frame-0.png',
  imageModel: 'qwen',
  edits: [
    edit(1, 'qwen-image-2.1-edit'),
    edit(2, 'flux3-klein-edit'),
    edit(3, 'qwen-image-2.1-edit'),
  ],
  picked: 1,
}

describe('EditCompare', () => {
  it("shows the Original and each edit model's newest edit, and picks one", async () => {
    const wrapper = mount(EditCompare, {
      props: { sessionId: 's1', picture: null },
      attachTo: document.body,
    })
    expect(wrapper.find('[data-compared-edit]').exists()).toBe(false)
    await wrapper.setProps({ picture, name: 'Frame 1' })
    await flushPromises()
    expect((wrapper.find('dialog').element as HTMLDialogElement).open).toBe(true)
    const panels = wrapper.findAll('[data-compared-edit]')
    // In the order the models were first used; each its newest, with what it was told.
    const caption = (p: (typeof panels)[number]) =>
      ['span > span', '[data-told]'].flatMap((s) =>
        p.findAll(`figcaption ${s}`).map((e) => e.text())
      )
    expect(panels.map((p) => [p.attributes('data-compared-edit'), ...caption(p)])).toEqual([
      ['0', 'Original', 'As rendered'],
      ['3', 'Qwen-Image 2.1 Edit', 'Edit 2', 'Paint 3'],
      ['2', 'FLUX.3 Klein Edit', 'Edit 1', 'Paint 2'],
    ])
    expect(panels.map((p) => p.find('img').attributes('src'))).toEqual([
      '/api/sessions/s1/images/frame-0.png',
      '/api/sessions/s1/images/edit-0-00000003.png',
      '/api/sessions/s1/images/edit-0-00000002.png',
    ])
    await panels[2].find('[data-pick-edit]').trigger('click')
    expect(wrapper.emitted('pick')).toEqual([[2]])
    // Picked from elsewhere: it says so in place of Pick.
    await wrapper.setProps({ picture: { ...picture, picked: 2 } })
    expect(wrapper.findAll('[data-compared-edit]')[2].find('[data-picked]').exists()).toBe(true)

    await wrapper.setProps({ picture: null })
    await flushPromises()
    expect((wrapper.find('dialog').element as HTMLDialogElement).open).toBe(false)
  })
})
