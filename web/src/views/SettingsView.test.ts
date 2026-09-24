import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import SettingsView from './SettingsView.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSettings: vi.fn(),
  getSettingsOptions: vi.fn(),
  saveSettings: vi.fn(),
}))

const settings: api.Settings = {
  textModel: 'llama3:latest',
  imageModel: 'z-image-turbo',
  steps: 9,
  size: 'portrait',
  quantize: null,
  seedMode: 'random',
  seed: 42,
}

const options: api.SettingsOptions = {
  textModels: ['gemma4:31b-mlx', 'llama3:latest'],
  imageModels: [
    { id: 'z-image-turbo', label: 'Z-Image Turbo', defaultSteps: 9 },
    { id: 'flux2-klein-4b', label: 'FLUX.2 Klein 4B', defaultSteps: 4 },
  ],
  sizePresets: [{ id: 'portrait', label: 'Portrait', width: 832, height: 1216 }],
}

beforeEach(() => {
  vi.mocked(api.getSettings).mockResolvedValue({ ...settings })
  vi.mocked(api.getSettingsOptions).mockResolvedValue(options)
  vi.mocked(api.saveSettings).mockImplementation(async (s) => s)
})

describe('SettingsView', () => {
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
