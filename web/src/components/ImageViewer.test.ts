import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ImageViewer from './ImageViewer.vue'

enableAutoUnmount(afterEach)

const mountIt = () =>
  mount(ImageViewer, { props: { src: null as string | null }, attachTo: document.body })

describe('ImageViewer', () => {
  it('opens as a dialog when given an image, showing it zoomable and full-size-linkable', async () => {
    const wrapper = mountIt()
    const dialog = wrapper.find('dialog').element as HTMLDialogElement
    expect(dialog.open).toBe(false)
    await wrapper.setProps({ src: '/api/sessions/r1/images/frame-0.png' })
    await flushPromises()
    expect(dialog.open).toBe(true)
    // At once: the image is there without waiting for a preload or a fade.
    expect(wrapper.find('[data-image-frame] img').attributes('src')).toBe(
      '/api/sessions/r1/images/frame-0.png',
    )
    expect(wrapper.find('a').attributes('href')).toBe('/api/sessions/r1/images/frame-0.png')
  })

  it('closes on a click outside the image, but not on the image', async () => {
    const wrapper = mountIt()
    await wrapper.setProps({ src: '/x.png' })
    await flushPromises()
    const dialog = wrapper.find('dialog').element as HTMLDialogElement
    await wrapper.find('[data-image-frame]').trigger('click')
    expect(dialog.open).toBe(true)
    await wrapper.find('dialog').trigger('click')
    expect(dialog.open).toBe(false)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('closes with its close button', async () => {
    const wrapper = mountIt()
    await wrapper.setProps({ src: '/x.png' })
    await flushPromises()
    await wrapper.find('button[aria-label=Close]').trigger('click')
    expect((wrapper.find('dialog').element as HTMLDialogElement).open).toBe(false)
  })

  it('asks for the previous or next image with the arrow keys and ‹ ›, when there is one', async () => {
    const wrapper = mountIt()
    await wrapper.setProps({
      src: '/x.png',
      label: 'Frame 3 · 2 of 3',
      hasPrevious: true,
      hasNext: false,
    })
    await flushPromises()
    expect(wrapper.find('[data-viewer-label]').text()).toBe('Frame 3 · 2 of 3')
    await wrapper.find('dialog').trigger('keydown', { key: 'ArrowLeft' })
    await wrapper.find('dialog').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('previous')).toHaveLength(1)
    expect(wrapper.emitted('next')).toBeUndefined()
    expect(wrapper.find('[data-next]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-previous]').trigger('click')
    expect(wrapper.emitted('previous')).toHaveLength(2)
  })

  it('shows no ‹ › when there is nothing to step through', async () => {
    const wrapper = mountIt()
    await wrapper.setProps({ src: '/x.png' })
    await flushPromises()
    expect(wrapper.find('[data-previous]').exists()).toBe(false)
  })
})
