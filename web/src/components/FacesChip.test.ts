import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import * as api from '../api'
import { providePictureMenu } from '../composables/usePictureMenu'
import { HOLD_MS } from '../contextMenu'
import FacesChip from './FacesChip.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  useFaces: vi.fn(() => Promise.resolve({})),
}))

enableAutoUnmount(afterEach)

const faced = (without = false): api.Picture => ({
  file: without ? 'frame-0-render.png' : 'frame-0-faces.png',
  imageModel: 'qwen-image-2.1',
  faces: {
    subjects: ['Kael', 'Elara Vance'],
    seed: 3,
    without,
    other: { file: without ? 'frame-0-faces.png' : 'frame-0-render.png' },
    timings: { find: 5, faces: 56 },
  },
})

/** The chip on a picture of Frame 1, on a screen that provides the picture's menu. */
function mountIt(picture: api.Picture) {
  const changed = vi.fn()
  const peeks: (string | null)[] = []
  const Screen = defineComponent(() => {
    providePictureMenu(() => ({
      sessionId: 's1',
      frames: [{ index: 0, pictures: [picture] }],
      imageModel: 'qwen-image-2.1',
      hasJob: () => false,
      canRender: () => true,
      queue: vi.fn(),
      edit: vi.fn(),
      look: vi.fn(),
      changed,
    }))
    return () => h(FacesChip, { picture, index: 0, onPeek: (f: string | null) => peeks.push(f) })
  })
  return { wrapper: mount(Screen, { attachTo: document.body }), changed, peeks }
}

describe('FacesChip', () => {
  it('says whose faces were repainted, and uses the render without them', async () => {
    const { wrapper, changed } = mountIt(faced())
    const chip = wrapper.get('[data-faces-chip]')
    expect(chip.text()).toBe('Faces from sheets')
    await chip.trigger('click')
    expect(wrapper.get('[data-pop-panel]').text()).toContain(
      'Faces from sheets · Kael and Elara Vance',
    )
    await wrapper.get('[data-faces-use]').trigger('click')
    await flushPromises()
    expect(api.useFaces).toHaveBeenCalledWith('s1', 0, true)
    expect(changed).toHaveBeenCalled()
  })

  it('offers the faces back once the render is used', async () => {
    const { wrapper } = mountIt(faced(true))
    expect(wrapper.get('[data-faces-chip]').text()).toBe('Without the face pass')
    await wrapper.get('[data-faces-chip]').trigger('click')
    expect(wrapper.get('[data-faces-use]').text()).toBe('Faces from sheets')
  })

  it('shows the render before while held, and a hold opens nothing', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper, peeks } = mountIt(faced())
      const chip = wrapper.get('[data-faces-chip]')
      await chip.trigger('pointerdown')
      vi.advanceTimersByTime(HOLD_MS)
      expect(peeks).toEqual(['frame-0-render.png'])
      await chip.trigger('pointerup')
      await chip.trigger('click')
      expect(peeks).toEqual(['frame-0-render.png', null])
      expect(wrapper.find('[data-pop-panel]').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('is left off a picture with no face pass, or one showing an edit without one', () => {
    const edited = {
      ...faced(),
      edits: [{ file: 'e.png', instructions: ['x'], editModel: 'm', seed: 4 }],
      picked: 1,
    }
    expect(mountIt({ file: 'f.png', imageModel: 'a' }).wrapper.find('[data-faces-chip]').exists())
      .toBe(false)
    expect(mountIt(edited).wrapper.find('[data-faces-chip]').exists()).toBe(false)
  })

  it("follows the edit a Frame shows, with that edit's own face pass", async () => {
    vi.useFakeTimers()
    const edit = {
      file: 'edit-0-faces.png',
      instructions: ['A low angle.'],
      editModel: 'm',
      seed: 4,
      faces: { ...faced().faces!, subjects: ['Kael'], other: { file: 'edit-0-before.png' } },
    }
    const { wrapper, peeks } = mountIt({ file: 'f.png', imageModel: 'a', edits: [edit], picked: 1 })
    const chip = wrapper.get('[data-faces-chip]')
    await chip.trigger('pointerdown')
    vi.advanceTimersByTime(HOLD_MS)
    expect(peeks).toEqual(['edit-0-before.png'])
    await chip.trigger('pointerup')
    expect(chip.attributes('title')).toBe('Faces from sheets: Kael')
    vi.useRealTimers()
  })

  it('only says whose faces once the picture before was left out, with nothing to hold', async () => {
    vi.useFakeTimers()
    const { other: _, ...alone } = faced().faces!
    const { wrapper, peeks } = mountIt({ ...faced(), faces: alone })
    const chip = wrapper.get('[data-faces-chip]')
    await chip.trigger('pointerdown')
    vi.advanceTimersByTime(HOLD_MS)
    await chip.trigger('pointerup')
    expect(peeks).toEqual([])
    await chip.trigger('click')
    expect(wrapper.get('[data-pop-panel]').text()).toContain('Kael and Elara Vance')
    expect(wrapper.find('[data-faces-alone]').exists()).toBe(true)
    expect(wrapper.find('[data-faces-use]').exists()).toBe(false)
    vi.useRealTimers()
  })
})
