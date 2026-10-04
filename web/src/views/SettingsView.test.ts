import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import SettingsView from './SettingsView.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSettings: vi.fn(),
  getSettingsOptions: vi.fn(),
  saveSettings: vi.fn(),
  listQuantized: vi.fn(),
  deleteQuantized: vi.fn(),
}))

const settings: api.Settings = {
  textModel: 'llama3:latest',
  thinking: false,
  imageModel: 'z-image-turbo',
  steps: 9,
  size: 'portrait',
  quantize: null,
  stepCache: 0.4,
  fast: false,
  seedMode: 'random',
  seed: 42,
  upscaler: 'seedvr2-7b',
  limits: true,
  artModel: '',
  artStyle: 'prose',
}

const options: api.SettingsOptions = {
  textModels: ['gemma4:31b-mlx', 'llama3:latest'],
  thinkingModels: [],
  imageModels: [
    { id: 'z-image-turbo', label: 'Z-Image Turbo', defaultSteps: 9, stepCache: false },
    { id: 'flux2-klein-4b', label: 'FLUX.2 Klein 4B', defaultSteps: 4, stepCache: false },
    {
      id: 'qwen-image-2.1',
      label: 'Qwen-Image 2.1',
      defaultSteps: 25,
      stepCache: true,
      fastSteps: 6,
    },
  ],
  sizePresets: [{ id: 'portrait', label: 'Portrait', width: 832, height: 1216 }],
  upscalers: [
    { id: 'seedvr2-7b', label: 'SeedVR2 7B' },
    { id: 'seedvr2-3b', label: 'SeedVR2 3B' },
  ],
}

beforeEach(() => {
  vi.mocked(api.listQuantized).mockReset().mockResolvedValue([])
  vi.mocked(api.getSettings).mockResolvedValue({ ...settings })
  vi.mocked(api.getSettingsOptions).mockResolvedValue(options)
  vi.mocked(api.saveSettings).mockImplementation(async (s) => s)
})

describe('SettingsView', () => {
  it('offers the step cache and Fast only for models that have them', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    expect(wrapper.find('[data-step-cache]').exists()).toBe(false)
    expect(wrapper.find('[data-fast]').exists()).toBe(false)
    await wrapper.findAll('select')[1].setValue('qwen-image-2.1')
    expect(wrapper.find('[data-step-cache]').exists()).toBe(true)
    await wrapper.find('[data-fast] input').setValue(true)
    // Fast sets its own steps, and the cache has no effect on so few.
    expect(wrapper.find('[data-step-cache]').exists()).toBe(false)
    const steps = wrapper.find('input[type=number]').element as HTMLInputElement
    expect([steps.value, steps.disabled]).toEqual(['6', true])
  })

  it('resets steps to the chosen Image Model default', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    await wrapper.findAll('select')[1].setValue('flux2-klein-4b')
    expect((wrapper.find('input[type=number]').element as HTMLInputElement).value).toBe('4')
  })

  it('saves the edited settings', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    await wrapper.findAll('select')[0].setValue('gemma4:31b-mlx')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith({ ...settings, textModel: 'gemma4:31b-mlx' })
    expect(wrapper.text()).toContain('Applies from the next Session')
  })

  it('sets a separate Art Agent model, from the installed Text Models', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    const select = wrapper.find('[data-art-model]')
    expect(select.findAll('option').map((o) => o.text())).toEqual([
      'Same as the Text Model',
      'gemma4:31b-mlx',
      'llama3:latest',
    ])
    await select.setValue('gemma4:31b-mlx')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith({ ...settings, artModel: 'gemma4:31b-mlx' })
  })

  it('has the Art Agent write tags instead of prose', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    await wrapper.find('[data-art-style]').setValue('tags')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith({ ...settings, artStyle: 'tags' })
  })

  it('lists saved quantized copies with their size, and deletes them', async () => {
    const copy = {
      name: 'flux2-klein-4b-8bit-mflux0.20.0',
      modelId: 'flux2-klein-4b',
      bits: 8,
      mflux: '0.20.0',
      bytes: 6_200_000_000,
      createdAt: '2026-10-01T00:00:00.000Z',
    }
    vi.mocked(api.listQuantized).mockResolvedValue([copy])
    vi.mocked(api.deleteQuantized).mockResolvedValue([])
    const wrapper = mount(SettingsView)
    await flushPromises()
    expect(wrapper.find('[data-quantized-copy]').text()).toContain(
      'FLUX.2 Klein 4B, 8-bit · 6.2 GB · mflux 0.20.0',
    )
    await wrapper.find('[data-quantized-copy] button').trigger('click')
    await flushPromises()
    expect(api.deleteQuantized).toHaveBeenCalledWith(copy.name)
    expect(wrapper.find('[data-quantized]').exists()).toBe(false)
  })

  it('turns the Limits off', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    expect((wrapper.find('[data-limits]').element as HTMLInputElement).checked).toBe(true)
    await wrapper.find('[data-limits]').setValue(false)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith({ ...settings, limits: false })
  })

  it('saves the chosen upscaler', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    await wrapper.find('[data-upscaler]').setValue('seedvr2-3b')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith({ ...settings, upscaler: 'seedvr2-3b' })
  })

  it('offers Thinking only for Text Models that can think', async () => {
    vi.mocked(api.getSettingsOptions).mockResolvedValue({
      ...options,
      thinkingModels: ['gemma4:31b-mlx'],
    })
    const wrapper = mount(SettingsView)
    await flushPromises()
    const toggle = () => wrapper.find('input[type=checkbox]')
    expect(toggle().attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain("llama3:latest can't think.")

    await wrapper.findAll('select')[0].setValue('gemma4:31b-mlx')
    expect(toggle().attributes('disabled')).toBeUndefined()
    await toggle().setValue(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ textModel: 'gemma4:31b-mlx', thinking: true }),
    )
  })

  it('shows a warning when Ollama is unreachable', async () => {
    vi.mocked(api.getSettingsOptions).mockResolvedValue({
      ...options,
      textModels: [],
      textModelsError: 'Could not reach Ollama: connection refused',
    })
    const wrapper = mount(SettingsView)
    await flushPromises()
    expect(wrapper.text()).toContain('Could not reach Ollama')
    expect(wrapper.findAll('option').map((o) => o.text())).toContain('llama3:latest')
  })
})
