import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { useFeatures } from '../composables/useFeatures'
import { ALL_AVAILABLE, ALL_ON } from '../testing'
import PictureButtons from './PictureButtons.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSettings: vi.fn(),
  getSettingsOptions: vi.fn(),
}))

const picture: api.Picture = { image: 'frame-0.png', imageModel: 'qwen-image-2.1' }

/** The buttons, with these Features switched on in Settings and able to run here. */
async function mountIt(
  props: Partial<InstanceType<typeof PictureButtons>['$props']> = {},
  features: { on?: Partial<typeof ALL_ON>; available?: Partial<typeof ALL_AVAILABLE> } = {},
) {
  vi.mocked(api.getSettingsOptions).mockResolvedValue(
    { features: { ...ALL_AVAILABLE, ...features.available } } as api.SettingsOptions,
  )
  vi.mocked(api.getSettings).mockResolvedValue(
    { features: { ...ALL_ON, ...features.on } } as api.Settings,
  )
  await useFeatures().refreshFeatures()
  const wrapper = mount(PictureButtons, { props: { hasJob: () => false, ...props } })
  await flushPromises()
  return wrapper
}
const has = (wrapper: Awaited<ReturnType<typeof mountIt>>, name: string) =>
  wrapper.find(`[data-${name}-button]`).exists()

beforeEach(() => {
  vi.mocked(api.getSettings).mockReset()
  vi.mocked(api.getSettingsOptions).mockReset()
})

describe('PictureButtons', () => {
  it('queues a render, an upscale and 3D of a picture, each off while its job is on the Frame', async () => {
    const wrapper = await mountIt({
      picture,
      canRender: true,
      hasJob: (kind) => kind === 'upscale',
    })
    expect(wrapper.find('[data-render-button]').text()).toBe('Re-render')
    expect(wrapper.find('[data-upscale-button]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-render-button]').trigger('click')
    await wrapper.find('[data-figure-button]').trigger('click')
    expect(wrapper.emitted('queue')).toEqual([['render'], ['figure']])
  })

  it('offers Upscale only once there is a picture, or a render queued to make one', async () => {
    expect(has(await mountIt({ canRender: true }), 'upscale')).toBe(false)
    expect(has(await mountIt({ hasJob: (kind) => kind === 'render' }), 'upscale')).toBe(true)
    const upscaled = await mountIt({ picture: { ...picture, upscaled: 'frame-0-2048.png' } })
    const button = upscaled.find('[data-upscale-button]')
    expect([button.text(), button.attributes('disabled')]).toEqual(['Upscaled', ''])
  })

  it('hides the buttons whose Features are off, in Settings or on this machine', async () => {
    const wrapper = await mountIt({ picture, canRender: true }, {
      on: { images: false, lito: false },
      available: { figures: { available: false, reason: 'No TripoSplat was set up' } },
    })
    // Pictures off takes Render, Upscale and Edit with it; 3D of a picture already there stays.
    for (const gone of ['render', 'upscale', 'edit', 'lito', 'figure']) {
      expect([gone, has(wrapper, gone)]).toEqual([gone, false])
    }
    expect(has(wrapper, 'scene')).toBe(true)
  })

  it('draws only the picture’s own buttons, or only the 3D ones, for a panel that groups them', async () => {
    const own = await mountIt({ picture, part: 'picture' })
    expect([has(own, 'upscale'), has(own, 'scene')]).toEqual([true, false])
    const threeD = await mountIt({ picture, part: '3d' })
    expect([has(threeD, 'upscale'), has(threeD, 'scene')]).toEqual([false, true])
  })
})
