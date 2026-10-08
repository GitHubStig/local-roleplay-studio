import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import SettingsView from './SettingsView.vue'
import { ALL_AVAILABLE, ALL_ON } from '../testing'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSettings: vi.fn(),
  getSettingsOptions: vi.fn(),
  // Settings lists the backend's models again 500 ms after it loads: a test that waits that long
  // gets this answer.
  listTextModels: vi.fn(() => Promise.resolve({ textModels: [], thinkingModels: [] })),
  checkComfyUI: vi.fn(() => Promise.resolve({ up: false as const, error: 'not running' })),
  saveSettings: vi.fn(),
  listQuantized: vi.fn(),
  deleteQuantized: vi.fn(),
}))

const settings: api.Settings = {
  textBackend: 'ollama',
  textBaseUrl: '',
  imageBackend: 'mflux',
  imageBaseUrl: '',
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
  upscaleBackend: 'mflux',
  voiceBackend: 'mlx-audio',
  limits: true,
  artModel: '',
  artStyle: 'prose',
  features: ALL_ON,
}

const options: api.SettingsOptions = {
  textModels: ['gemma4:31b-mlx', 'llama3:latest'],
  thinkingModels: [],
  imageModels: {
    mflux: [
      {
        id: 'z-image-turbo',
        label: 'Z-Image Turbo',
        defaultSteps: 9,
        stepCache: false,
        quantize: true,
      },
      {
        id: 'flux2-klein-4b',
        label: 'FLUX.2 Klein 4B',
        defaultSteps: 4,
        stepCache: false,
        quantize: true,
      },
      {
        id: 'qwen-image-2.1',
        label: 'Qwen-Image 2.1',
        defaultSteps: 25,
        stepCache: true,
        fastSteps: 6,
        quantize: true,
      },
    ],
    comfyui: [
      {
        id: 'qwen-image-2.1',
        label: 'Qwen-Image 2.1',
        defaultSteps: 25,
        stepCache: false,
        quantize: false,
      },
    ],
  },
  sizePresets: [{ id: 'portrait', label: 'Portrait', width: 832, height: 1216 }],
  upscalers: [
    { id: 'seedvr2-7b', label: 'SeedVR2 7B' },
    { id: 'seedvr2-3b', label: 'SeedVR2 3B' },
  ],
  features: ALL_AVAILABLE,
}

beforeEach(() => {
  vi.mocked(api.listQuantized).mockReset().mockResolvedValue([])
  vi.mocked(api.getSettings).mockResolvedValue({ ...settings })
  vi.mocked(api.getSettingsOptions).mockResolvedValue(options)
  vi.mocked(api.saveSettings).mockImplementation(async (s) => s)
})

describe('SettingsView', () => {
  it('without mflux, offers ComfyUI, and its own Image Models once chosen', async () => {
    const noMflux = { available: false, reason: 'mflux runs only on Apple Silicon Macs' }
    vi.mocked(api.getSettingsOptions).mockResolvedValue({
      ...options,
      features: { ...options.features, images: noMflux, upscale: noMflux },
    })
    const wrapper = mount(SettingsView)
    await flushPromises()
    // Nothing to set up with mflux, but the backend can still be chosen.
    expect(wrapper.find('[data-image-model]').exists()).toBe(false)
    vi.mocked(api.checkComfyUI).mockResolvedValue({
      up: false,
      error: "Couldn't reach ComfyUI at http://127.0.0.1:8188: is it running?",
    })
    await wrapper.find('[data-image-backend]').setValue('comfyui')
    expect(wrapper.find('[data-image-base-url]').exists()).toBe(true)
    // Checked as soon as it's chosen: down, until ComfyUI is started and checked again.
    await new Promise((r) => setTimeout(r, 600))
    await flushPromises()
    expect(wrapper.find('[data-comfy-status]').text()).toContain('Down: Couldn')
    vi.mocked(api.checkComfyUI).mockResolvedValue({
      up: true,
      version: '0.39.1',
      device: 'mps',
      ready: true,
    })
    await wrapper.find('[data-check-comfy]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-comfy-status]').text()).toContain('Up: ComfyUI 0.39.1 on mps')
    expect(api.checkComfyUI).toHaveBeenLastCalledWith('', {
      imageModel: 'qwen-image-2.1',
      upscaler: undefined,
    })
    const models = wrapper.findAll('[data-image-model] option').map((o) => o.text())
    expect(models).toEqual(['Qwen-Image 2.1'])
    // ComfyUI's models have no Quantize, step cache or Fast; Upscale is still mflux's, so off.
    expect(wrapper.text()).not.toContain('Quantize')
    expect(wrapper.find('[data-step-cache]').exists()).toBe(false)
    expect(wrapper.find('[data-upscaler]').exists()).toBe(false)
    // Upscaling there too: the Upscaler can be chosen, and the check covers its files.
    await wrapper.find('[data-upscale-backend]').setValue('comfyui')
    expect(wrapper.find('[data-upscaler]').exists()).toBe(true)
    await new Promise((r) => setTimeout(r, 600))
    await flushPromises()
    expect(api.checkComfyUI).toHaveBeenLastCalledWith('', {
      imageModel: 'qwen-image-2.1',
      upscaler: 'seedvr2-7b',
    })
    await wrapper.find('[data-image-base-url]').setValue('http://192.168.1.20:8188')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      imageBackend: 'comfyui',
      imageBaseUrl: 'http://192.168.1.20:8188',
      imageModel: 'qwen-image-2.1',
      steps: 25,
      upscaleBackend: 'comfyui',
    }))
  })

  it('on a Mac, can render with mflux and upscale with ComfyUI on another machine', async () => {
    vi.mocked(api.checkComfyUI).mockResolvedValue({
      up: true,
      version: '0.39.1',
      device: 'cuda:0 NVIDIA GeForce RTX 4070',
      ready: true,
    })
    const wrapper = mount(SettingsView)
    await flushPromises()
    // Both on mflux: no ComfyUI address to give.
    expect(wrapper.find('[data-image-base-url]').exists()).toBe(false)
    await wrapper.find('[data-upscale-backend]').setValue('comfyui')
    await wrapper.find('[data-image-base-url]').setValue('http://192.168.1.20:8188')
    await new Promise((r) => setTimeout(r, 600))
    await flushPromises()
    // Only the upscaler runs there, so only its files are checked.
    expect(api.checkComfyUI).toHaveBeenLastCalledWith('http://192.168.1.20:8188', {
      imageModel: undefined,
      upscaler: 'seedvr2-7b',
    })
    expect(wrapper.find('[data-comfy-status]').text()).toContain(
      'on cuda:0 NVIDIA GeForce RTX 4070',
    )
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      imageBackend: 'mflux',
      upscaleBackend: 'comfyui',
      imageBaseUrl: 'http://192.168.1.20:8188',
    }))
  })

  it('without the voice service, speaks with ComfyUI, checking it has the voice nodes', async () => {
    vi.mocked(api.getSettingsOptions).mockResolvedValue({
      ...options,
      features: {
        ...options.features,
        voices: {
          available: false,
          reason: 'The voice service (mlx-audio) runs only on Apple Silicon Macs',
        },
      },
    })
    vi.mocked(api.checkComfyUI).mockResolvedValue({
      up: true,
      version: '0.39.2',
      device: 'cuda:0 NVIDIA GeForce RTX 4070',
      ready: false,
      missing: "ComfyUI doesn't have the TTS Audio Suite nodes voices need",
    })
    const wrapper = mount(SettingsView)
    await flushPromises()
    await wrapper.find('[data-tab="voice"]').trigger('click')
    const voices = () => wrapper.find('[data-feature="voices"]')
    expect(voices().find('[data-unavailable]').exists()).toBe(true)
    await wrapper.find('[data-voice-backend]').setValue('comfyui')
    await new Promise((r) => setTimeout(r, 600))
    await flushPromises()
    // Available once sent to ComfyUI; its check looks for the nodes, and says what's missing.
    expect(voices().find('[data-unavailable]').exists()).toBe(false)
    expect(api.checkComfyUI).toHaveBeenLastCalledWith('', {
      imageModel: undefined,
      upscaler: undefined,
      voices: true,
    })
    expect(wrapper.find('[data-tab-panel="voice"] [data-comfy-status]').text()).toContain(
      'TTS Audio Suite nodes',
    )
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      voiceBackend: 'comfyui',
    }))
  })

  it('offers the step cache and Fast only for models that have them', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    expect(wrapper.find('[data-step-cache]').exists()).toBe(false)
    expect(wrapper.find('[data-fast]').exists()).toBe(false)
    await wrapper.find('[data-image-model]').setValue('qwen-image-2.1')
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
    await wrapper.find('[data-image-model]').setValue('flux2-klein-4b')
    expect((wrapper.find('input[type=number]').element as HTMLInputElement).value).toBe('4')
  })

  it('saves the edited settings', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    await wrapper.find('[data-text-model]').setValue('gemma4:31b-mlx')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith({ ...settings, textModel: 'gemma4:31b-mlx' })
    expect(wrapper.text()).toContain('Applies from the next Session')
  })

  it("shows each extra on its tab, says why one can't run here, and saves a switch", async () => {
    vi.mocked(api.getSettingsOptions).mockResolvedValue({
      ...options,
      features: {
        ...ALL_AVAILABLE,
        lito: {
          available: false,
          reason: 'LiTo (through mlx-spatial) runs only on Apple Silicon Macs',
        },
      },
    })
    const wrapper = mount(SettingsView, { attachTo: document.body })
    await flushPromises()
    const panel = (id: string) => wrapper.find(`[data-tab-panel="${id}"]`)
    expect(panel('text').isVisible()).toBe(true)
    expect(panel('3d').isVisible()).toBe(false)
    await wrapper.find('[data-tab="3d"]').trigger('click')
    expect(panel('3d').isVisible()).toBe(true)

    // LiTo can't run here: its switch is off and greyed out, with the reason.
    const lito = wrapper.find('[data-feature="lito"] input')
    expect([(lito.element as HTMLInputElement).checked, lito.attributes('disabled')]).toEqual([
      false,
      '',
    ])
    expect(wrapper.find('[data-feature="lito"] [data-unavailable]').text()).toContain(
      'runs only on Apple Silicon Macs',
    )
    await wrapper.find('[data-feature="scenes"] input').setValue(false)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith({
      ...settings,
      features: { ...settings.features, scenes: false },
    })
    wrapper.unmount()
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
    // mflux's own copies: not shown while ComfyUI is chosen, which doesn't use them.
    await wrapper.find('[data-image-backend]').setValue('comfyui')
    expect(wrapper.find('[data-quantized]').exists()).toBe(false)
    await wrapper.find('[data-image-backend]').setValue('mflux')
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

    await wrapper.find('[data-text-model]').setValue('gemma4:31b-mlx')
    expect(toggle().attributes('disabled')).toBeUndefined()
    await toggle().setValue(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ textModel: 'gemma4:31b-mlx', thinking: true }),
    )
  })

  it('switches to an OpenAI-compatible server, lists its models with a new key, and saves it', async () => {
    vi.mocked(api.listTextModels).mockResolvedValue({
      textModels: ['gemma-4-26b'],
      thinkingModels: ['gemma-4-26b'],
    })
    vi.mocked(api.saveSettings).mockImplementation(async ({ textApiKey: _, ...s }) => ({
      ...s,
      textApiKeySet: true,
    }))
    const wrapper = mount(SettingsView)
    await flushPromises()
    expect(wrapper.find('[data-text-api-key]').exists()).toBe(false)

    await wrapper.find('[data-text-backend]').setValue('openai')
    const address = wrapper.find('[data-text-base-url]').element as HTMLInputElement
    expect(address.value).toBe('http://localhost:1234/v1')
    // The key is saved once the field is left (`change`), not while it's typed.
    await wrapper.find('[data-text-api-key]').setValue('sk-new')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ textBackend: 'openai', textApiKey: 'sk-new' }),
    )
    // Saved: the field empties, and says a key is saved.
    const key = wrapper.find('[data-text-api-key]').element as HTMLInputElement
    expect(key.value).toBe('')
    expect(key.placeholder).toContain('Saved')
    // The listing then asks with the saved key.
    await new Promise((resolve) => setTimeout(resolve, 600)) // the listing waits for typing to stop
    await flushPromises()
    expect(api.listTextModels).toHaveBeenLastCalledWith({
      textBackend: 'openai',
      textBaseUrl: 'http://localhost:1234/v1',
      textApiKey: undefined,
    })
    expect(wrapper.findAll('[data-text-model] option').map((o) => o.text())).toContain(
      'gemma-4-26b',
    )

    await wrapper.find('[data-text-model]').setValue('gemma-4-26b')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ textModel: 'gemma-4-26b', textApiKey: undefined }),
    )

    // Removing the key saves at once.
    await wrapper.find('[data-remove-api-key]').trigger('click')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ textApiKey: '' }))
  })

  it('saves each change by itself once typing pauses, and says so at the top', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    expect(wrapper.find('button[type=submit]').exists()).toBe(false)
    await wrapper.find('[data-text-base-url]').setValue('http://192.168.1.20:11434')
    // Nothing yet while typing; once it pauses, one save.
    expect(api.saveSettings).not.toHaveBeenCalled()
    await new Promise((resolve) => setTimeout(resolve, 700))
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledTimes(1)
    expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ textBaseUrl: 'http://192.168.1.20:11434' }),
    )
    expect(wrapper.find('[data-settings-status] [data-saved]').text()).toContain(
      'Applies from the next Session',
    )
    // Turned down: not saved, and why, at the top; nothing is saved again until it changes.
    vi.mocked(api.saveSettings).mockRejectedValueOnce(
      new api.ApiError('Invalid settings', 400, ['textBaseUrl must be an address']),
    )
    await wrapper.find('[data-text-base-url]').setValue('http//oops')
    await new Promise((resolve) => setTimeout(resolve, 700))
    await flushPromises()
    expect(wrapper.find('[data-settings-status] [data-save-error]').text()).toContain(
      'textBaseUrl must be an address',
    )
    expect(api.saveSettings).toHaveBeenCalledTimes(2)
    // Put back as it was saved: nothing to save, and the error goes.
    await wrapper.find('[data-text-base-url]').setValue('http://192.168.1.20:11434')
    await new Promise((resolve) => setTimeout(resolve, 700))
    await flushPromises()
    expect(wrapper.find('[data-save-error]').exists()).toBe(false)
    expect(api.saveSettings).toHaveBeenCalledTimes(2)
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
