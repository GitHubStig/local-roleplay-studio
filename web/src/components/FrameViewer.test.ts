import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job, PicturedFrame, Settings, SettingsOptions } from '../api'
import FrameViewer from './FrameViewer.vue'

// Two edit models here, Qwen on both kinds of backend; Settings start an edit on Qwen, sending
// edits to the ComfyUI.
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getSettings: vi.fn(() => Promise.resolve({ editModel: 'qwen-image-2.1-edit' } as Settings)),
  getSettingsOptions: vi.fn(() =>
    Promise.resolve({
      editModels: [
        {
          id: 'qwen-image-2.1-edit',
          label: 'Qwen-Image 2.1 Edit',
          backends: ['mflux', 'comfyui'],
          prompting: 'An instruction.',
        },
        {
          id: 'flux3-klein-edit',
          label: 'FLUX.3 Klein Edit',
          backends: ['comfyui'],
          prompting: 'A caption.',
        },
      ],
      imageBackends: ['mflux', 'comfyui'],
      editModelsOn: { 'qwen-image-2.1-edit': 'comfyui', 'flux3-klein-edit': 'comfyui' },
    } as unknown as SettingsOptions)
  ),
}))

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
    expect(wrapper.find('[data-viewer-caption]').text()).toBe(
      'Qwen-Image 2.1 Edit, Edit 1: Paint 1',
    )
    expect(versions(wrapper).map((b) => b.text())).toEqual(['Original', 'Edit 1', 'Edit 2'])
    expect(versions(wrapper)[1].attributes('aria-pressed')).toBe('true')
    // Redo and Delete are for the newest, once it's shown.
    expect(side(wrapper).find('[data-redo-edit]').exists()).toBe(false)
    await versions(wrapper)[0].trigger('click')
    expect(wrapper.emitted('pick')).toEqual([[0, 0]])
  })

  it('toggles a version between its upscale and without, and deletes the upscale', async () => {
    const upscaled = [{
      ...frames[0],
      pictures: [{ ...frames[0].pictures[0], picked: 0 }],
    }]
    const wrapper = mountIt({ frames: upscaled })
    await flushPromises()
    // The upscale shows by default; a version without one (Edit 1 here) has no buttons.
    expect(shownSrc(wrapper)).toBe(url('frame-0-2048.png'))
    expect(side(wrapper).find('[data-delete-upscale]').exists()).toBe(true)
    await wrapper.setProps({ frames })
    expect(side(wrapper).find('[data-toggle-upscale]').exists()).toBe(false)
    expect(side(wrapper).find('[data-delete-upscale]').exists()).toBe(false)
    await wrapper.setProps({ frames: upscaled })

    await side(wrapper).find('[data-toggle-upscale]').trigger('click')
    expect(shownSrc(wrapper)).toBe(url('frame-0.png'))
    await side(wrapper).find('[data-toggle-upscale]').trigger('click')
    expect(shownSrc(wrapper)).toBe(url('frame-0-2048.png'))

    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirm)
    await side(wrapper).find('[data-delete-upscale]').trigger('click')
    expect(wrapper.emitted('deleteUpscale')).toBeUndefined()
    await side(wrapper).find('[data-delete-upscale]').trigger('click')
    expect(wrapper.emitted('deleteUpscale')).toEqual([[0]])
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
    expect(wrapper.emitted('deleteEdit')).toEqual([[0, 2]])

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
    const model = wrapper.find('[data-edit-model]')
    // Each model once per kind of backend that runs it, Settings' choice to start on.
    expect(model.findAll('option').map((o) => o.text())).toEqual([
      'Qwen-Image 2.1 Edit · mflux',
      'Qwen-Image 2.1 Edit · ComfyUI',
      'FLUX.3 Klein Edit · ComfyUI',
    ])
    expect((model.element as HTMLSelectElement).value).toBe('comfyui/qwen-image-2.1-edit')
    expect(wrapper.find('[data-edit-prompting]').text()).toBe('An instruction.')
    // FLUX.3 has no edits here: its first is painted over the Original, as it likes to be told.
    await model.setValue('comfyui/flux3-klein-edit')
    expect(shownSrc(wrapper)).toBe(url('frame-0.png'))
    expect(wrapper.find('[data-edit-prompting]').text()).toBe('A caption.')
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
    expect(wrapper.emitted('edit')).toEqual([
      [0, { instruction: 'A cup', model: 'flux3-klein-edit', backend: 'comfyui' }],
    ])

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

  it('groups the versions by edit model, Redo and Delete acting on the line of the one shown', async () => {
    const flux = { ...edit(3), editModel: 'flux3-klein-edit', instructions: ['A caption 3'] }
    const lines = [{
      ...frames[0],
      pictures: [{ ...frames[0].pictures[0], edits: [edit(1), flux, edit(2)], picked: 2 }],
    }]
    const wrapper = mountIt({ frames: lines })
    await flushPromises()
    expect(side(wrapper).findAll('[data-version-group]').map((g) => g.text())).toEqual([
      'Qwen-Image 2.1 Edit',
      'FLUX.3 Klein Edit',
    ])
    expect(versions(wrapper).map((b) => [b.attributes('data-version'), b.text()])).toEqual([
      ['0', 'Original'],
      ['1', 'Edit 1'],
      ['3', 'Edit 2'],
      ['2', 'Edit 1'],
    ])
    expect(wrapper.find('[data-viewer-caption]').text()).toBe(
      'FLUX.3 Klein Edit, Edit 1: A caption 3',
    )
    // FLUX.3's only edit is its line's newest: redone from the Original, by FLUX.3 alone.
    await side(wrapper).find('[data-redo-edit]').trigger('click')
    await flushPromises()
    expect(shownSrc(wrapper)).toBe(url('frame-0.png'))
    expect((wrapper.find('[data-edit-model]').element as HTMLSelectElement).disabled).toBe(true)
    expect(wrapper.find('[data-paint-tools]').text()).toContain(
      'It replaces FLUX.3 Klein Edit, Edit 1.',
    )
    // Qwen's first isn't its line's newest: nothing to redo or delete there.
    await wrapper.find('[data-paint-tools] button[title^="Back"]').trigger('click')
    await versions(wrapper)[1].trigger('click')
    await wrapper.setProps({
      frames: [{ ...lines[0], pictures: [{ ...lines[0].pictures[0], picked: 1 }] }],
    })
    expect(side(wrapper).find('[data-delete-edit]').exists()).toBe(false)
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

  it("plays the shown version's clips over it, one at a time, stopping on another version", async () => {
    const clip = (kind: 'lead-in' | 'idle-loop', file: string) => ({
      kind,
      file,
      prompt: 'She looks up.',
      seconds: 4,
      speech: false,
      seed: 1,
      timings: { clip: 9 },
    })
    const withClips = [{
      index: 0,
      pictures: [{
        ...frames[0].pictures[0],
        clips: [clip('lead-in', 'clip-0-lead-in-00000000.mp4')],
        edits: [
          {
            ...edit(1),
            clips: [
              clip('lead-in', 'clip-0-lead-in-11111111.mp4'),
              clip('idle-loop', 'clip-0-idle-loop-22222222.mp4'),
            ],
          },
          edit(2),
        ],
      }],
    }]
    const wrapper = mountIt({ frames: withClips })
    await flushPromises()
    const buttons = side(wrapper).findAll('[data-play-clip]')
    expect(buttons.map((b) => b.text())).toEqual(['Lead In', 'Idle Loop'])
    await buttons[1].trigger('click')
    const video = wrapper.find('[data-clip-overlay] video')
    expect(video.attributes('src')).toBe(url('clip-0-idle-loop-22222222.mp4'))
    expect(video.attributes('loop')).toBeDefined()
    await buttons[0].trigger('click')
    expect(wrapper.find('[data-clip-overlay] video').attributes('src')).toBe(
      url('clip-0-lead-in-11111111.mp4'),
    )
    await buttons[0].trigger('click')
    expect(wrapper.find('[data-clip-overlay]').exists()).toBe(false)
    await buttons[0].trigger('click')
    await wrapper.setProps({
      frames: [{ ...withClips[0], pictures: [{ ...withClips[0].pictures[0], picked: 2 }] }],
    })
    expect(wrapper.find('[data-clip-overlay]').exists()).toBe(false)
    expect(side(wrapper).find('[data-play-clip]').exists()).toBe(false)
  })
})
