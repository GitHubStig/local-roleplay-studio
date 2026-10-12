import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ImageViewer from './ImageViewer.vue'

enableAutoUnmount(afterEach)

/** VueUse's onClickOutside takes one click per tick, as a person's clicks always are. */
const tick = () => new Promise((r) => setTimeout(r))

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
    const press = async (on: string) => {
      await wrapper.find(on).trigger('pointerdown')
      await wrapper.find(on).trigger('click', { detail: 1 })
      await tick()
    }
    await press('[data-image-frame]')
    expect(dialog.open).toBe(true)
    // A pan that starts on the image and lets go outside it doesn't close it either.
    await wrapper.find('[data-image-frame]').trigger('pointerdown')
    await wrapper.find('dialog').trigger('click', { detail: 1 })
    await tick()
    expect(dialog.open).toBe(true)
    await press('dialog')
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

  it('opens with the focus on itself, and steps with the keys wherever the focus went', async () => {
    const wrapper = mountIt()
    await wrapper.setProps({ src: '/x.png', hasPrevious: false, hasNext: true })
    await flushPromises()
    // Not on ›, which would be disabled under it at the last image.
    expect(document.activeElement).toBe(wrapper.find('dialog').element) // The browser dropped the focus out of the dialog (a ‹ › disabled while focused): keys still step.
    ;(document.activeElement as HTMLElement).blur()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await wrapper.setProps({ hasPrevious: true, hasNext: false })
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect([wrapper.emitted('next')?.length, wrapper.emitted('previous')?.length]).toEqual([1, 1])
    // Closed, the keys are the page's again.
    await wrapper.setProps({ src: null })
    await flushPromises()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(wrapper.emitted('previous')).toHaveLength(1)
  })

  it('steps up and down too, by key and button, only when it goes that way', async () => {
    const wrapper = mountIt()
    await wrapper.setProps({ src: '/x.png', hasNext: true, hasUp: true, hasDown: true })
    await flushPromises()
    expect(wrapper.find('[data-up]').exists()).toBe(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(wrapper.emitted('up')).toBeUndefined()

    await wrapper.setProps({ vertical: true, verticalName: 'Frame', hasDown: false })
    expect(wrapper.find('[data-up]').attributes('title')).toBe('Previous Frame (↑)')
    expect(wrapper.find('[data-down]').attributes('disabled')).toBeDefined()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await wrapper.find('[data-up]').trigger('click')
    expect([wrapper.emitted('up')?.length, wrapper.emitted('down')]).toEqual([2, undefined])
  })

  it('steps with a swipe, the finger pulling the next image in, but not with a pinch', async () => {
    const wrapper = mountIt()
    await wrapper.setProps({
      src: '/x.png',
      hasPrevious: true,
      hasNext: true,
      vertical: true,
      hasUp: true,
      hasDown: true,
    })
    await flushPromises()
    const dialog = wrapper.find('dialog').element
    const touch = (type: string, ...points: [number, number][]) => {
      const e = new Event(type, { bubbles: true })
      Object.defineProperty(e, 'touches', {
        value: points.map(([clientX, clientY]) => ({ clientX, clientY })),
      })
      dialog.dispatchEvent(e)
    }
    const swipe = (from: [number, number], to: [number, number]) => {
      touch('touchstart', from)
      touch('touchmove', to)
      touch('touchend')
    }
    swipe([300, 300], [100, 310]) // left
    swipe([100, 300], [300, 290]) // right
    swipe([200, 400], [210, 200]) // up: the Frame below
    swipe([200, 200], [190, 400]) // down: the Frame above
    swipe([200, 200], [220, 210]) // too short
    expect(['next', 'previous', 'down', 'up'].map((e) => wrapper.emitted(e)?.length)).toEqual([
      1,
      1,
      1,
      1,
    ])

    // A second finger makes it a pinch, which zooms instead.
    touch('touchstart', [300, 300])
    touch('touchmove', [100, 300])
    touch('touchstart', [100, 300], [200, 200])
    touch('touchend')
    expect(wrapper.emitted('next')).toHaveLength(1)
  })

  it('shows no ‹ › when there is nothing to step through', async () => {
    const wrapper = mountIt()
    await wrapper.setProps({ src: '/x.png' })
    await flushPromises()
    expect(wrapper.find('[data-previous]').exists()).toBe(false)
  })
})
