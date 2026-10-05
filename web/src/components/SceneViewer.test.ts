import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SceneViewer from './SceneViewer.vue'

// Drawing needs WebGL, which tests don't have; the viewer reports it couldn't draw.
vi.mock('three', () => ({}))
vi.mock('@sparkjsdev/spark', () => ({}))
vi.mock('three/addons/controls/OrbitControls.js', () => ({}))

enableAutoUnmount(afterEach)

/** VueUse's onClickOutside takes one click per tick, as a person's clicks always are. */
const tick = () => new Promise((r) => setTimeout(r))

describe('SceneViewer', () => {
  it('closes on a click outside the scene and its buttons, but not after a turn', async () => {
    const wrapper = mount(SceneViewer, {
      props: { src: null as string | null, label: 'Frame 0' },
      attachTo: document.body,
    })
    await wrapper.setProps({ src: '/api/sessions/r1/images/scene-0-aaaaaaaa.ply' })
    await flushPromises()
    const dialog = wrapper.find('dialog').element as HTMLDialogElement
    expect(dialog.open).toBe(true)
    const press = async (on: string) => {
      await wrapper.find(on).trigger('pointerdown')
      await wrapper.find(on).trigger('click', { detail: 1 })
      await tick()
    }
    await press('canvas')
    await press('[data-viewer-controls]')
    expect(dialog.open).toBe(true)
    // A turn that starts on the scene and lets go outside it.
    await wrapper.find('canvas').trigger('pointerdown')
    await wrapper.find('dialog').trigger('click', { detail: 1 })
    await tick()
    expect(dialog.open).toBe(true)
    await press('dialog')
    expect(dialog.open).toBe(false)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
