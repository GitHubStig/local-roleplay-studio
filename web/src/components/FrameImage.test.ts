import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import FrameImage from './FrameImage.vue'

/** An Image that loads at once. */
class FakeImage {
  onload: (() => void) | null = null
  set src(_src: string) {
    queueMicrotask(() => this.onload?.())
  }
}

beforeEach(() => vi.stubGlobal('Image', FakeImage))
afterEach(() => vi.unstubAllGlobals())

it('says why there’s no picture, but not over one forming in its place', async () => {
  const wrapper = mount(FrameImage, {
    props: { src: null, emptyText: 'Not rendered yet', rendering: 'image', preview: null },
  })
  expect(wrapper.text()).toContain('Not rendered yet')
  await wrapper.setProps({ preview: { src: '/api/sessions/s1/preview?step=1', opacity: 0.1 } })
  await flushPromises()
  expect(wrapper.find('[data-preview]').exists()).toBe(true)
  expect(wrapper.text()).not.toContain('Not rendered yet')
})
