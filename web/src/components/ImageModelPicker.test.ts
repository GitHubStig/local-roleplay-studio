import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { loadSettingsOptions } from '../composables/useSettingsOptions'
import { IMAGE_MODELS } from '../testing'
import ImageModelPicker from './ImageModelPicker.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSettingsOptions: vi.fn(),
  setImageModel: vi.fn(),
}))

type Picked = { id: string; settings: api.SessionSettings; frames: api.PicturedFrame[] }
const session = (settings: Partial<api.SessionSettings> = {}): Picked => ({
  id: 's1',
  settings: { imageModel: 'qwen-image-2.1', steps: 25, ...settings } as api.SessionSettings,
  frames: [],
})

/** Qwen-Image 2.1 on both kinds of backend, FLUX.2 Klein 4B on mflux and MOSS-Image on ComfyUI. */
async function mountIt(picked: Picked, imageModelsOn: Record<string, api.ImageBackend> = {}) {
  vi.mocked(api.getSettingsOptions).mockResolvedValue({
    imageModels: {
      ...IMAGE_MODELS,
      comfyui: [IMAGE_MODELS.mflux[0], {
        ...IMAGE_MODELS.mflux[0],
        id: 'moss-image',
        label: 'MOSS-Image',
      }],
    },
    imageBackends: ['mflux', 'comfyui'],
    imageModelsOn,
  } as unknown as api.SettingsOptions)
  await loadSettingsOptions()
  const wrapper = mount(ImageModelPicker<Picked>, { props: { session: picked } })
  await flushPromises()
  return wrapper
}
const groupsOf = (wrapper: Awaited<ReturnType<typeof mountIt>>) =>
  wrapper.find('[data-image-model]').findAll('optgroup').map((g) => [
    g.attributes('label'),
    g.findAll('option').map((o) => o.text()),
  ])

beforeEach(() => {
  vi.mocked(api.setImageModel).mockReset()
})
enableAutoUnmount(afterEach)

describe('ImageModelPicker', () => {
  it('lists each Image Model under each kind of backend that has it, by name within each', async () => {
    // The lists have Qwen-Image 2.1 first in both; each group is by name, mflux before ComfyUI.
    expect(groupsOf(await mountIt(session()))).toEqual([
      ['mflux', ['FLUX.2 Klein 4B · mflux', 'Qwen-Image 2.1 · mflux']],
      ['ComfyUI', ['MOSS-Image · ComfyUI', 'Qwen-Image 2.1 · ComfyUI']],
    ])
  })

  it('shows the model where Settings send it until the Session picks a kind, and keeps the kind picked', async () => {
    const picked = session()
    const wrapper = await mountIt(picked, { 'qwen-image-2.1': 'comfyui' })
    const select = wrapper.find('[data-image-model]')
    expect((select.element as HTMLSelectElement).value).toBe('comfyui/qwen-image-2.1')

    const onMflux = { ...picked, settings: { ...picked.settings, imageBackend: 'mflux' as const } }
    vi.mocked(api.setImageModel).mockResolvedValue(onMflux)
    await select.setValue('mflux/qwen-image-2.1')
    await flushPromises()
    expect(api.setImageModel).toHaveBeenCalledWith('s1', 'qwen-image-2.1', 'mflux')
    expect(wrapper.emitted('switched')).toEqual([[onMflux]])
    await wrapper.setProps({ session: onMflux })
    expect((select.element as HTMLSelectElement).value).toBe('mflux/qwen-image-2.1')
  })

  it('says why a switch failed, and goes back to the Session’s own model', async () => {
    const wrapper = await mountIt(session({ imageBackend: 'mflux' }))
    vi.mocked(api.setImageModel).mockRejectedValue(new Error('A render is running'))
    const select = wrapper.find('[data-image-model]')
    await select.setValue('comfyui/moss-image')
    await flushPromises()
    expect(wrapper.emitted('failed')).toEqual([['A render is running']])
    expect((select.element as HTMLSelectElement).value).toBe('mflux/qwen-image-2.1')
  })

  it('shows the steps the model renders at', async () => {
    const wrapper = await mountIt(session({ imageModel: 'flux2-klein-4b', steps: 4 }))
    expect(wrapper.find('[data-image-steps]').text()).toBe('· 4 steps')
  })
})
