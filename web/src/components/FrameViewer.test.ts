import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job, PicturedFrame } from '../api'
import FrameViewer from './FrameViewer.vue'

enableAutoUnmount(afterEach)
afterEach(() => vi.unstubAllGlobals())

const edit = (n: number) => ({
  image: `edit-0-0000000${n}.png`,
  instructions: [`Paint ${n}`],
  editModel: 'qwen-image-2.1-edit',
  seed: n,
  mask: `mask-0-0000000${n}.png`,
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
const editJob = (status: Job['status'], extra: Partial<Job> = {}): Job => ({
  id: 'j1',
  kind: 'edit',
  frameIndex: 0,
  status,
  createdAt: '',
  edit: { instruction: 'A cup', mask: 'mask-0-0000000a.png' },
  ...extra,
})

const mountIt = (props: Partial<InstanceType<typeof FrameViewer>['$props']> = {}) =>
  mount(FrameViewer, {
    props: { sessionId: 's1', frames, imageModel: 'qwen', open: 0, ...props },
    attachTo: document.body,
  })
type Wrapper = ReturnType<typeof mountIt>
const shownSrc = (wrapper: Wrapper) => wrapper.find('[data-image-frame] img').attributes('src')
const url = (file: string) => `/api/sessions/s1/images/${file}`
/** The side column (a row under the picture repeats it, for a phone). */
const side = (wrapper: Wrapper) => wrapper.find('[data-image-side]')
const versions = (wrapper: Wrapper) => side(wrapper).findAll('[data-version]')

describe('FrameViewer', () => {
  it('shows a picture as its picked version, and picks another beside it', async () => {
    const wrapper = mountIt()
    await flushPromises()
    expect(shownSrc(wrapper)).toBe(url('edit-0-00000001.png'))
    expect(wrapper.find('[data-viewer-caption]').text()).toBe('Edit 1: Paint 1')
    expect(versions(wrapper).map((b) => b.text())).toEqual(['Original', 'Edit 1', 'Edit 2'])
    expect(versions(wrapper)[1].attributes('aria-pressed')).toBe('true')
    // Redo and Delete are for the newest, once it's shown.
    expect(side(wrapper).find('[data-redo-edit]').exists()).toBe(false)
    await versions(wrapper)[0].trigger('click')
    expect(wrapper.emitted('pick')).toEqual([[0, 0]])
  })

  it('makes the newest edit again from its area and instruction, or deletes it', async () => {
    const newest = [{ ...frames[0], pictures: [{ ...frames[0].pictures[0], picked: 2 }] }]
    const wrapper = mountIt({ frames: newest })
    await flushPromises()
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirm)
    await side(wrapper).find('[data-delete-edit]').trigger('click')
    expect(wrapper.emitted('deleteEdit')).toBeUndefined()
    await side(wrapper).find('[data-delete-edit]').trigger('click')
    expect(wrapper.emitted('deleteEdit')).toEqual([[0]])

    await side(wrapper).find('[data-redo-edit]').trigger('click')
    await flushPromises()
    // Painted over what it was made from (Edit 1), its instruction to change.
    expect(shownSrc(wrapper)).toBe(url('edit-0-00000001.png'))
    const instruction = wrapper.find('[data-edit-instruction]')
    expect((instruction.element as HTMLTextAreaElement).value).toBe('Paint 2')
    await instruction.setValue('Paint 2, bluer')
    await wrapper.find('[data-send-edit]').trigger('click')
    // Its old area is kept, but no canvas can be read here: what's checked is what it's told.
    expect(wrapper.emitted('edit')![0][1]).toMatchObject({
      instruction: 'Paint 2, bluer',
      retry: true,
    })
  })

  it("paints a new edit over the newest version, then shows it as it's made", async () => {
    const wrapper = mountIt()
    await flushPromises()
    await side(wrapper).find('[data-edit]').trigger('click')
    await flushPromises()
    expect(shownSrc(wrapper)).toBe(url('edit-0-00000002.png'))
    expect(wrapper.find('[data-paint-tools]').exists()).toBe(true)
    // The arrow keys don't step while painting; Esc goes back to the picture, the draft kept.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(wrapper.emitted('step')).toBeUndefined()
    await wrapper.find('[data-edit-instruction]').setValue('A cup')
    wrapper.find('dialog').element.dispatchEvent(new Event('cancel', { cancelable: true }))
    await flushPromises()
    expect(wrapper.find('[data-paint-tools]').exists()).toBe(false)
    expect((wrapper.find('dialog').element as HTMLDialogElement).open).toBe(true)
    await side(wrapper).find('[data-edit]').trigger('click')
    const box = wrapper.find('[data-edit-instruction]').element as HTMLTextAreaElement
    expect(box.value).toBe('A cup')
    await wrapper.find('[data-send-edit]').trigger('click')
    expect(wrapper.emitted('edit')).toEqual([[0, { instruction: 'A cup' }]])

    // Queued: it shows among the versions, over what it's made from, with where it's painted.
    const running = editJob('running', { phase: 'image', progress: { step: 12, total: 40 } })
    await wrapper.setProps({ jobs: [running] })
    await flushPromises()
    // Its state on a line of its own, so a long label doesn't spill over.
    expect(versions(wrapper).map((b) => b.findAll('span').map((s) => s.text()))).toEqual([
      ['Original'],
      ['Edit 1'],
      ['Edit 2'],
      ['Edit 3', 'editing'],
    ])
    expect(versions(wrapper)[3].attributes('aria-pressed')).toBe('true')
    expect(shownSrc(wrapper)).toBe(url('edit-0-00000002.png'))
    // The border sweeps as on the screens (where it was painted shows once the picture loads).
    expect(wrapper.find('[data-image-frame]').attributes('data-rendering')).toBe('image')
    expect(wrapper.find('[data-viewer-caption]').text()).toBe('Editing · step 12 of 40\nA cup')
    expect(side(wrapper).find('[data-edit]').attributes('disabled')).toBeDefined()
    await side(wrapper).find('[data-cancel-edit]').trigger('click')
    expect(wrapper.emitted('dropJob')).toEqual([[running]])
  })

  it('opens on an edit being made, and offers one that failed to redo or delete', async () => {
    const wrapper = mountIt({ jobs: [editJob('queued')] })
    await flushPromises()
    expect(wrapper.find('[data-viewer-caption]').text()).toBe('Waiting its turn\nA cup')
    // Asked to paint while one is being made: it shows that one instead.
    await wrapper.setProps({ painting: true })
    await flushPromises()
    expect(wrapper.find('[data-paint-tools]').exists()).toBe(false)
    expect(wrapper.emitted('update:painting')).toEqual([[false]])

    const failed = editJob('failed', { error: 'mflux crashed' })
    await wrapper.setProps({ jobs: [failed] })
    await flushPromises()
    await versions(wrapper)[3].trigger('click')
    expect(versions(wrapper)[3].findAll('span').map((s) => s.text())).toEqual(['Edit 3', 'failed'])
    expect(wrapper.find('[data-viewer-caption]').text()).toBe('Failed: mflux crashed\nA cup')
    await side(wrapper).find('[data-redo-edit]').trigger('click')
    await wrapper.find('[data-send-edit]').trigger('click')
    // Asked again as it was, the failed one dismissed.
    expect(wrapper.emitted('edit')![0][1]).toMatchObject({ instruction: 'A cup' })
    expect(wrapper.emitted('dropJob')).toEqual([[failed]])
  })

  it('shows a picture with no edits as it was, upscaled, without versions', async () => {
    const plain = [{
      index: 0,
      pictures: [{ ...frames[0].pictures[0], edits: undefined, picked: undefined }],
    }]
    const wrapper = mountIt({ frames: plain })
    await flushPromises()
    expect(shownSrc(wrapper)).toBe(url('frame-0-2048.png'))
    expect(side(wrapper).find('[role=group]').exists()).toBe(false)
    expect(side(wrapper).find('[data-edit]').exists()).toBe(true)
    expect(wrapper.find('[data-viewer-caption]').exists()).toBe(false)
  })
})
