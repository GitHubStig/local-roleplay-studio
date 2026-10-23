import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PicturedFrame } from '../api'
import FrameViewer from './FrameViewer.vue'

enableAutoUnmount(afterEach)
afterEach(() => vi.unstubAllGlobals())

const edit = (n: number) => ({
  image: `edit-0-0000000${n}.png`,
  instructions: [`Paint ${n}`],
  editModel: 'qwen-image-2.1-edit',
  seed: n,
})
/** One Frame whose picture has two edits, the first picked, and the render upscaled. */
const frames: PicturedFrame[] = [{
  index: 0,
  pictures: [{
    image: 'frame-0.png',
    upscaled: 'frame-0-2048.png',
    imageModel: 'qwen',
    edits: [edit(1), edit(2)],
    picked: 1,
  }],
}]

const mountIt = (props: Partial<InstanceType<typeof FrameViewer>['$props']> = {}) =>
  mount(FrameViewer, {
    props: { sessionId: 's1', frames, imageModel: 'qwen', open: 0, ...props },
    attachTo: document.body,
  })
const shownSrc = (wrapper: ReturnType<typeof mountIt>) =>
  wrapper.find('[data-image-frame] img').attributes('src')

describe('FrameViewer', () => {
  it('shows a picture as its picked version, and picks another from its versions', async () => {
    const wrapper = mountIt()
    await flushPromises()
    expect(shownSrc(wrapper)).toBe('/api/sessions/s1/images/edit-0-00000001.png')
    expect(wrapper.find('[data-viewer-caption]').text()).toBe('Edit 1: Paint 1')
    const versions = wrapper.findAll('[data-versions] button')
    expect(versions.map((b) => b.text())).toEqual(['Original', 'Edit 1', 'Edit 2'])
    expect(versions[1].attributes('aria-pressed')).toBe('true')
    await versions[0].trigger('click')
    expect(wrapper.emitted('pick')).toEqual([[0, 0]])
  })

  it('retries or deletes the newest edit, once asked', async () => {
    const wrapper = mountIt()
    await flushPromises()
    await wrapper.find('[data-retry-edit]').trigger('click')
    expect(wrapper.emitted('edit')).toEqual([[0, { retry: true }]])
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirm)
    await wrapper.find('[data-delete-edit]').trigger('click')
    expect(wrapper.emitted('deleteEdit')).toBeUndefined()
    await wrapper.find('[data-delete-edit]').trigger('click')
    expect(wrapper.emitted('deleteEdit')).toEqual([[0]])
    expect(confirm).toHaveBeenLastCalledWith("Delete Edit 2 of Frame 0? This can't be undone.")
  })

  it('paints an edit over the newest version, and sends what to paint there', async () => {
    const wrapper = mountIt()
    await flushPromises()
    await wrapper.find('[data-edit]').trigger('click')
    await flushPromises()
    // The newest version, at its own size (not an upscale), whichever is picked.
    expect(shownSrc(wrapper)).toBe('/api/sessions/s1/images/edit-0-00000002.png')
    expect(wrapper.find('[data-paint-tools]').exists()).toBe(true)
    expect(wrapper.find('[data-versions]').exists()).toBe(false)
    // The arrow keys don't step while painting.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(wrapper.emitted('step')).toBeUndefined()
    expect(wrapper.find('[data-send-edit]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-edit-instruction]').setValue('  A hand reaching forward ')
    await wrapper.find('[data-send-edit]').trigger('click')
    // Nothing painted: the whole picture.
    expect(wrapper.emitted('edit')).toEqual([[0, { instruction: 'A hand reaching forward' }]])
    expect(wrapper.emitted('update:painting')).toEqual([[true], [false]])
  })

  it('waits while an edit is queued or running on the Frame', async () => {
    const wrapper = mountIt({ editing: () => true })
    await flushPromises()
    for (const button of ['[data-edit]', '[data-retry-edit]', '[data-delete-edit]']) {
      expect(wrapper.find(button).attributes('disabled')).toBeDefined()
    }
    expect(wrapper.find('[data-versions] button').attributes('disabled')).toBeDefined()
  })

  it('shows a picture with no edits as it was, upscaled, without versions', async () => {
    const plain = [{
      index: 0,
      pictures: [{ ...frames[0].pictures[0], edits: undefined, picked: undefined }],
    }]
    const wrapper = mountIt({ frames: plain })
    await flushPromises()
    expect(shownSrc(wrapper)).toBe('/api/sessions/s1/images/frame-0-2048.png')
    expect(wrapper.find('[data-versions]').exists()).toBe(false)
    expect(wrapper.find('[data-retry-edit]').exists()).toBe(false)
    expect(wrapper.find('[data-viewer-caption]').exists()).toBe(false)
  })
})
