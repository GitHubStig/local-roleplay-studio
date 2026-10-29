import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
}))

const settings: api.Settings = {
  backends: [
    { id: 'here', kind: 'here', address: '' },
    { id: 'ollama', kind: 'ollama', address: '' },
  ],
  runOn: { text: 'ollama', images: 'here', upscale: 'here', edits: 'here', voices: 'here' },
  textModel: 'llama3:latest',
  thinking: false,
  imageModel: 'z-image-turbo',
  steps: 9,
  size: 'portrait',
  quantize: null,
  stepCache: 0.4,
  float16: 'auto',
  previews: true,
  seedMode: 'random',
  seed: 42,
  upscaler: 'seedvr2-7b',
  editModel: 'qwen-image-2.1-edit',
  videoModel: 'ltx-2.5',
  limits: true,
  callLog: false,
  artModel: '',
  features: ALL_ON,
}

const options: api.SettingsOptions = {
  textModels: ['gemma4:31b-mlx', 'llama3:latest'],
  thinkingModels: [],
  imageBackends: ['mflux', 'comfyui'],
  imageModels: {
    mflux: [
      {
        id: 'z-image-turbo',
        label: 'Z-Image Turbo',
        defaultSteps: 9,
        stepCache: false,
        quantize: true,
        float16: true,
      },
      {
        id: 'flux2-klein-4b',
        label: 'FLUX.2 Klein 4B',
        defaultSteps: 4,
        stepCache: false,
        quantize: true,
        float16: true,
      },
      {
        id: 'qwen-image-2.1',
        label: 'Qwen-Image 2.1',
        defaultSteps: 25,
        stepCache: true,
        quantize: true,
        float16: true,
      },
      {
        id: 'qwen-image-2.1-viggle',
        label: 'Qwen-Image 2.1 Viggle Turbo',
        defaultSteps: 6,
        stepChoices: [6],
        stepCache: false,
        quantize: true,
        float16: true,
      },
      {
        id: 'ideogram-4',
        label: 'Ideogram 4',
        defaultSteps: 20,
        stepChoices: [12, 20, 48],
        stepCache: false,
        quantize: false,
        float16: false,
      },
    ],
    comfyui: [
      {
        id: 'qwen-image-2.1',
        label: 'Qwen-Image 2.1',
        defaultSteps: 25,
        stepCache: false,
        quantize: false,
        float16: false,
      },
    ],
  },
  sizePresets: [{ id: 'portrait', label: 'Portrait', width: 832, height: 1216 }],
  editModels: [
    { id: 'qwen-image-2.1-edit', label: 'Qwen-Image 2.1 Edit', backends: ['mflux', 'comfyui'] },
    { id: 'flux3-klein-edit', label: 'FLUX.3 Klein Edit', backends: ['comfyui'] },
  ],
  videoModels: [{ id: 'ltx-2.5', label: 'LTX 2.5' }],
  upscalers: [
    { id: 'seedvr2-7b', label: 'SeedVR2 7B' },
    { id: 'seedvr2-3b', label: 'SeedVR2 3B' },
  ],
  features: ALL_AVAILABLE,
  here: ALL_AVAILABLE,
}

beforeEach(() => {
  // The tab shown is remembered: each test starts on Text.
  localStorage.clear()
  // Fake, so a debounce left pending by one test never fires in the next.
  vi.useFakeTimers()
  // A copy of its own for each test, as the page changes its lists in place.
  vi.mocked(api.getSettings).mockImplementation(() => Promise.resolve(structuredClone(settings)))
  vi.mocked(api.getSettingsOptions).mockResolvedValue(options)
  vi.mocked(api.saveSettings).mockImplementation((s) => Promise.resolve(s))
})

afterEach(() => vi.useRealTimers())

describe('SettingsView', () => {
  /** Adds a Backend on the Machines tab, at `address` if given. */
  async function addBackend(
    wrapper: ReturnType<typeof mount>,
    kind: 'comfyui' | 'ollama' | 'openai',
    address?: string,
  ) {
    await wrapper.find('[data-tab="machines"]').trigger('click')
    await wrapper.find(`[data-add-backend="${kind}"]`).trigger('click')
    if (address) {
      await wrapper.find(`[data-backend="${kind}"] [data-backend-address]`).setValue(address)
    }
  }

  /** Settings with a ComfyUI listed beside this machine, and Qwen-Image 2.1, which both have. */
  const withComfyUI = () =>
    vi.mocked(api.getSettings).mockResolvedValue({
      ...structuredClone(settings),
      backends: [...settings.backends, { id: 'pc', kind: 'comfyui', address: '' }],
      imageModel: 'qwen-image-2.1',
    })

  it('without mflux, renders on a ComfyUI once one is added', async () => {
    const noMflux = { available: false, reason: 'mflux runs only on Apple Silicon Macs' }
    const here = { ...ALL_AVAILABLE, images: noMflux, upscale: noMflux, edits: noMflux }
    vi.mocked(api.getSettingsOptions).mockResolvedValue({
      ...options,
      imageBackends: ['comfyui'],
      features: here,
      here,
    })
    const wrapper = mount(SettingsView)
    await flushPromises()
    // Nowhere to render yet: the Pictures switch says why, and its options are hidden.
    expect(wrapper.find('[data-feature="images"] [data-unavailable]').text()).toContain(
      'runs only on Apple Silicon Macs',
    )
    expect(wrapper.find('[data-image-model]').exists()).toBe(false)
    expect(wrapper.find('[data-card="upscale"]').exists()).toBe(false)
    vi.mocked(api.checkComfyUI).mockResolvedValue({
      up: false,
      error: "Couldn't reach ComfyUI at http://127.0.0.1:8188: is it running?",
    })
    await addBackend(wrapper, 'comfyui')
    // Once one's added, its models are listed by name, and the saved one stays though mflux's.
    expect(wrapper.findAll('[data-image-model] option').map((o) => o.text())).toEqual([
      'Qwen-Image 2.1',
      'Z-Image Turbo',
    ])
    await wrapper.find('[data-image-model]').setValue('qwen-image-2.1')
    // Checked as soon as it's added: down, until ComfyUI is started and checked again.
    await vi.advanceTimersByTimeAsync(600)
    await flushPromises()
    const status = () => wrapper.find('[data-backend="comfyui"] [data-comfy-status]')
    expect(status().text()).toContain('Down: Couldn')
    vi.mocked(api.checkComfyUI).mockResolvedValue({
      up: true,
      version: '0.39.1',
      device: 'mps',
      ready: true,
    })
    await status().find('[data-check-comfy]').trigger('click')
    await flushPromises()
    expect(status().text()).toContain('Up: ComfyUI 0.39.1 on mps')
    // Pictures and Upscale both go there, as this machine can do neither: its check covers both.
    expect(api.checkComfyUI).toHaveBeenLastCalledWith('', {
      imageModel: 'qwen-image-2.1',
      upscaler: 'seedvr2-7b',
      voices: undefined,
      videoModel: 'ltx-2.5',
    })
    // This machine stays preferred, but can't: the Images tab says where they go.
    expect(wrapper.find('[data-run-on="images"] [data-goes-to]').text()).toContain('ComfyUI')
    expect(wrapper.find('[data-run-on="images"] [data-comfy-status]').text()).toContain('Up')
    // ComfyUI's models have no Quantize, step cache or float16.
    expect(wrapper.text()).not.toContain('Quantize')
    expect(wrapper.find('[data-step-cache]').exists()).toBe(false)
    expect(wrapper.find('[data-feature="upscale"] [data-unavailable]').exists()).toBe(false)
    await wrapper.find('[data-backend="comfyui"] [data-backend-address]').setValue(
      'http://192.0.2.20:8188',
    )
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      backends: [...settings.backends, {
        id: 'comfyui',
        kind: 'comfyui',
        address: 'http://192.0.2.20:8188',
      }],
      imageModel: 'qwen-image-2.1',
      steps: 25,
    }))
  })

  it('on a Mac, can render with mflux and upscale on a ComfyUI on another machine', async () => {
    vi.mocked(api.checkComfyUI).mockResolvedValue({
      up: true,
      version: '0.39.1',
      device: 'cuda:0 NVIDIA GeForce RTX 4070',
      ready: true,
    })
    const wrapper = mount(SettingsView)
    await flushPromises()
    await addBackend(wrapper, 'comfyui', 'http://192.0.2.20:8188')
    await wrapper.find('[data-tab="images"]').trigger('click')
    await wrapper.find('[data-run-on="upscale"] select').setValue('comfyui')
    await vi.advanceTimersByTimeAsync(600)
    await flushPromises()
    // Only the upscaler goes there, so only its files are checked.
    expect(api.checkComfyUI).toHaveBeenLastCalledWith('http://192.0.2.20:8188', {
      imageModel: undefined,
      upscaler: 'seedvr2-7b',
      voices: undefined,
      // The only ComfyUI listed: clips go there too.
      videoModel: 'ltx-2.5',
    })
    expect(wrapper.find('[data-run-on="upscale"] [data-comfy-status]').text()).toContain(
      'on cuda:0 NVIDIA GeForce RTX 4070',
    )
    expect(wrapper.find('[data-run-on="images"] [data-comfy-status]').exists()).toBe(false)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      runOn: { ...settings.runOn, upscale: 'comfyui' },
    }))
  })

  it('without the voice service, speaks on a ComfyUI, checking it has the voice nodes', async () => {
    const noVoices = {
      available: false,
      reason: 'The voice service (mlx-audio) runs only on Apple Silicon Macs',
    }
    vi.mocked(api.getSettingsOptions).mockResolvedValue({
      ...options,
      features: { ...options.features, voices: noVoices },
      here: { ...options.here, voices: noVoices },
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
    const voices = () => wrapper.find('[data-feature="voices"]')
    expect(voices().find('[data-unavailable]').exists()).toBe(true)
    await addBackend(wrapper, 'comfyui')
    await vi.advanceTimersByTimeAsync(600)
    await flushPromises()
    // Available once there's a ComfyUI; its check looks for the nodes, and says what's missing.
    expect(voices().find('[data-unavailable]').exists()).toBe(false)
    expect(api.checkComfyUI).toHaveBeenLastCalledWith('', {
      imageModel: undefined,
      upscaler: undefined,
      voices: true,
      videoModel: 'ltx-2.5',
    })
    expect(wrapper.find('[data-tab-panel="voice"] [data-comfy-status]').text()).toContain(
      'TTS Audio Suite nodes',
    )
  })

  it('takes a Backend off the list, moving the work that preferred it, and reorders them', async () => {
    vi.mocked(api.getSettings).mockResolvedValue({
      ...settings,
      backends: [...settings.backends, { id: 'pc', kind: 'comfyui', address: 'http://pc:8188' }],
      runOn: { ...settings.runOn, upscale: 'pc', voices: 'pc' },
    })
    const wrapper = mount(SettingsView)
    await flushPromises()
    await wrapper.find('[data-tab="machines"]').trigger('click')
    const order = () => wrapper.findAll('[data-backend]').map((b) => b.attributes('data-backend'))
    expect(order()).toEqual(['here', 'ollama', 'pc'])
    // This machine's own can't be taken off.
    expect(wrapper.find('[data-backend="here"] [data-remove-backend]').exists()).toBe(false)
    await wrapper.find('[data-backend="pc"] [data-move-up]').trigger('click')
    expect(order()).toEqual(['here', 'pc', 'ollama'])
    await wrapper.find('[data-backend="pc"] [data-remove-backend]').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      backends: settings.backends,
      runOn: settings.runOn,
    }))
  })

  it("hides an extra's options while its switch is off, and every image option with Pictures", async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    const shown = (selector: string) => wrapper.find(selector).exists()
    expect(wrapper.find('[data-feature="images"] input').attributes('role')).toBe('switch')
    expect([shown('[data-upscaler]'), shown('[data-edit-model]')]).toEqual([true, true])
    await wrapper.find('[data-feature="upscale"] input').setValue(false)
    expect([shown('[data-upscaler]'), shown('[data-run-on="upscale"]')]).toEqual([false, false])
    expect(shown('[data-edit-model]')).toBe(true)
    // Pictures off: none of the image options, Upscale's and Edits' cards with them.
    await wrapper.find('[data-feature="images"] input').setValue(false)
    expect(['[data-image-model]', '[data-card="upscale"]', '[data-card="edits"]'].map(shown))
      .toEqual([false, false, false])
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      features: { ...settings.features, images: false, upscale: false },
    }))
  })

  it('offers the step cache only for models that take it', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    expect(wrapper.find('[data-step-cache]').exists()).toBe(false)
    await wrapper.find('[data-image-model]').setValue('qwen-image-2.1')
    expect(wrapper.find('[data-step-cache]').exists()).toBe(true)
    await wrapper.find('[data-image-model]').setValue('qwen-image-2.1-viggle')
    expect(wrapper.find('[data-step-cache]').exists()).toBe(false)
  })

  it('offers only the steps a model has presets for, picked from a list', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    await wrapper.find('[data-image-model]').setValue('ideogram-4')
    const choices = () => wrapper.find('[data-step-choices]')
    const select = () => choices().element as HTMLSelectElement
    expect(choices().findAll('option').map((o) => o.text())).toEqual(['12', '20', '48'])
    expect([select().value, select().disabled]).toEqual(['20', false])
    await choices().setValue('12')
    expect(select().value).toBe('12')
    // One preset only: shown, not chosen.
    await wrapper.find('[data-image-model]').setValue('qwen-image-2.1-viggle')
    expect([select().value, select().disabled]).toEqual(['6', true])
    // Any count for the others.
    await wrapper.find('[data-image-model]').setValue('qwen-image-2.1')
    expect(choices().exists()).toBe(false)
    expect((wrapper.find('input[type=number]').element as HTMLInputElement).value).toBe('25')
  })

  it('offers the picture forming only where renders go to a ComfyUI, and saves it off', async () => {
    withComfyUI()
    const wrapper = mount(SettingsView)
    await flushPromises()
    expect(wrapper.find('[data-previews]').exists()).toBe(false)
    await wrapper.find('[data-run-on="images"] select').setValue('pc')
    await wrapper.find('[data-previews] input').setValue(false)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ previews: false }))
  })

  it('offers float16 for models that take it, Automatic by default, and saves it off', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    const select = wrapper.find('[data-float16] select')
    expect((select.element as HTMLSelectElement).value).toBe('auto')
    await select.setValue('off')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ float16: 'off' }))
  })

  it('offers float16 only where renders go to mflux, which takes it', async () => {
    withComfyUI()
    const wrapper = mount(SettingsView)
    await flushPromises()
    expect(wrapper.find('[data-float16]').exists()).toBe(true)
    await wrapper.find('[data-run-on="images"] select').setValue('pc')
    expect(wrapper.find('[data-float16]').exists()).toBe(false)
  })

  it('resets steps to the chosen Image Model default', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    await wrapper.find('[data-image-model]').setValue('flux2-klein-4b')
    expect((wrapper.find('input[type=number]').element as HTMLInputElement).value).toBe('4')
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
    expect(wrapper.find('[data-settings-status]').classes()).toContain('top-0')
    expect(wrapper.find('[data-settings-status]').classes()).toContain('pb-4')
    expect(wrapper.find('[data-settings-status] [data-settings-tabs]').exists()).toBe(true)
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

  it('switches Clips off on their own tab, saying why where no ComfyUI makes them', async () => {
    vi.mocked(api.getSettingsOptions).mockResolvedValue({
      ...options,
      features: {
        ...ALL_AVAILABLE,
        video: { available: false, reason: 'Clips are made on a ComfyUI with LTX 2.5' },
      },
    })
    const unavailable = mount(SettingsView, { attachTo: document.body })
    await flushPromises()
    await unavailable.find('[data-tab="clips"]').trigger('click')
    expect(unavailable.find('[data-tab-panel="clips"]').isVisible()).toBe(true)
    expect(unavailable.find('[data-feature="video"] [data-unavailable]').text()).toContain(
      'a ComfyUI with LTX 2.5',
    )
    unavailable.unmount()

    vi.mocked(api.getSettingsOptions).mockResolvedValue(options)
    const wrapper = mount(SettingsView, { attachTo: document.body })
    await flushPromises()
    await wrapper.find('[data-tab="clips"]').trigger('click')
    // Its video model, chosen from those the server lists.
    const model = wrapper.find<HTMLSelectElement>(
      '[data-video-model] select, select[data-video-model]',
    )
    expect(model.element.value).toBe('ltx-2.5')
    expect(model.findAll('option').map((o) => o.text())).toEqual(['LTX 2.5'])
    await wrapper.find('[data-feature="video"] input').setValue(false)
    expect(wrapper.find('[data-video-model]').exists()).toBe(false)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith({
      ...settings,
      features: { ...settings.features, video: false },
    })
    wrapper.unmount()
  })

  it('comes back to the tab it was on, after a reload', async () => {
    const first = mount(SettingsView, { attachTo: document.body })
    await flushPromises()
    expect(first.find('[data-tab-panel="text"]').isVisible()).toBe(true)
    await first.find('[data-tab="clips"]').trigger('click')
    first.unmount()
    const again = mount(SettingsView, { attachTo: document.body })
    await flushPromises()
    expect(again.find('[data-tab-panel="clips"]').isVisible()).toBe(true)
    expect(again.find('[data-tab-panel="text"]').isVisible()).toBe(false)
    again.unmount()
    // A tab that's gone (renamed, say) falls back to Text.
    localStorage.setItem('settings-tab', 'video')
    const gone = mount(SettingsView, { attachTo: document.body })
    await flushPromises()
    expect(gone.find('[data-tab-panel="text"]').isVisible()).toBe(true)
    gone.unmount()
  })

  it('keeps the seed in Advanced, there even where pictures cannot be made', async () => {
    vi.mocked(api.getSettingsOptions).mockResolvedValue({
      ...options,
      features: { ...ALL_AVAILABLE, images: { available: false, reason: 'No mflux here' } },
      here: { ...ALL_AVAILABLE, images: { available: false, reason: 'No mflux here' } },
    })
    const wrapper = mount(SettingsView, { attachTo: document.body })
    await flushPromises()
    const seed = wrapper.find('[data-tab-panel="advanced"]')
    expect(wrapper.find('[data-tab-panel="images"] input[value="fixed"]').exists()).toBe(false)
    expect(seed.isVisible()).toBe(false)
    await wrapper.find('[data-tab="advanced"]').trigger('click')
    expect(seed.isVisible()).toBe(true)
    // With the Limits, the call log and the style scores, which aren't one model's either.
    for (const control of ['[data-limits]', '[data-call-log]', '[data-feature="style"]']) {
      expect(seed.find(control).exists()).toBe(true)
    }
    expect(seed.find('[data-feature="style"]').text()).toContain('Image comparison style scores')
    await seed.find('input[value="fixed"]').setValue(true)
    await seed.find('input[type="number"]').setValue(7)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith({ ...settings, seedMode: 'fixed', seed: 7 })
    wrapper.unmount()
  })

  it('offers the edit models that run here, each saying where it would go, and keeps one that no longer does', async () => {
    withComfyUI()
    const wrapper = mount(SettingsView)
    await flushPromises()
    const labels = () => wrapper.findAll('[data-edit-model] option').map((o) => o.text()).sort()
    // Edits go to this machine, so Qwen-Image 2.1 Edit runs on mflux; FLUX.3 only on ComfyUI.
    expect(labels()).toEqual(['FLUX.3 Klein Edit · ComfyUI', 'Qwen-Image 2.1 Edit · mflux'])
    // Sent to the ComfyUI instead, before it's saved: both run there.
    await wrapper.find('[data-run-on="edits"] select').setValue('pc')
    expect(labels()).toEqual(['FLUX.3 Klein Edit · ComfyUI', 'Qwen-Image 2.1 Edit · ComfyUI'])
    // Where nothing runs Qwen-Image 2.1 Edit, Settings' own is shown, as not here, until another
    // is chosen.
    vi.mocked(api.getSettingsOptions).mockResolvedValue({
      ...options,
      editModels: [{
        id: 'flux3-klein-edit',
        label: 'FLUX.3 Klein Edit',
        backends: ['comfyui'],
      }],
    })
    const pc = mount(SettingsView)
    await flushPromises()
    expect(pc.findAll('[data-edit-model] option').map((o) => o.text())).toEqual([
      'qwen-image-2.1-edit (not available here)',
      'FLUX.3 Klein Edit · ComfyUI',
    ])
  })

  it('sorts the default Image Model and the default edit model by name, not as the lists have them', async () => {
    withComfyUI()
    const wrapper = mount(SettingsView)
    await flushPromises()
    const labelsOf = (selector: string) =>
      wrapper.findAll(`${selector} option`).map((o) => o.text())
    const sorted = (labels: string[]) =>
      [...labels].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    for (const selector of ['[data-image-model]', '[data-edit-model]']) {
      const labels = labelsOf(selector)
      expect(labels.length).toBeGreaterThan(1)
      expect(labels).toEqual(sorted(labels))
    }
    // The fixture lists Z-Image Turbo before FLUX.2 Klein 4B, so this isn't the lists' own order.
    expect(labelsOf('[data-image-model]')[0]).toBe('FLUX.2 Klein 4B')
  })

  it('saves each control into its own field', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    expect((wrapper.find('[data-limits] input').element as HTMLInputElement).checked).toBe(true)
    await wrapper.find('[data-text-model]').setValue('gemma4:31b-mlx')
    await wrapper.find('[data-limits] input').setValue(false)
    await wrapper.find('[data-upscaler]').setValue('seedvr2-3b')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenLastCalledWith({
      ...settings,
      textModel: 'gemma4:31b-mlx',
      limits: false,
      upscaler: 'seedvr2-3b',
    })
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

  it('adds an OpenAI-compatible server, lists its models with a new key, and saves it', async () => {
    vi.mocked(api.listTextModels).mockResolvedValue({
      textModels: ['gemma-4-26b'],
      thinkingModels: ['gemma-4-26b'],
    })
    // As the server keeps keys: a key replaces one, '' removes it, and one left out stays.
    const saved = new Set<string>()
    vi.mocked(api.saveSettings).mockImplementation(({ apiKeys, ...s }) => {
      for (const [id, key] of Object.entries(apiKeys ?? {})) {
        if (key) saved.add(id)
        else saved.delete(id)
      }
      return Promise.resolve({ ...s, apiKeysSet: [...saved] })
    })
    const wrapper = mount(SettingsView)
    await flushPromises()
    expect(wrapper.find('[data-api-key]').exists()).toBe(false)

    await addBackend(wrapper, 'openai', 'http://localhost:1234/v1')
    // The key is saved once the field is left (`change`), not while it's typed.
    await wrapper.find('[data-api-key]').setValue('sk-new')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ apiKeys: { openai: 'sk-new' } }),
    )
    // Saved: the field empties, and says a key is saved.
    const key = wrapper.find('[data-api-key]').element as HTMLInputElement
    expect(key.value).toBe('')
    expect(key.placeholder).toContain('saved')
    // The Text Model runs there: its models are listed, with the saved key.
    await wrapper.find('[data-tab="text"]').trigger('click')
    await wrapper.find('[data-run-on="text"] select').setValue('openai')
    await vi.advanceTimersByTimeAsync(600) // the listing waits for typing to stop
    await flushPromises()
    expect(api.listTextModels).toHaveBeenLastCalledWith({
      id: 'openai',
      kind: 'openai',
      address: 'http://localhost:1234/v1',
      apiKey: undefined,
    })
    expect(wrapper.findAll('[data-text-model] option').map((o) => o.text())).toContain(
      'gemma-4-26b',
    )

    await wrapper.find('[data-text-model]').setValue('gemma-4-26b')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      textModel: 'gemma-4-26b',
      runOn: { ...settings.runOn, text: 'openai' },
      apiKeys: undefined,
    }))

    // Removing the key saves at once.
    await wrapper.find('[data-tab="machines"]').trigger('click')
    await wrapper.find('[data-remove-api-key]').trigger('click')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKeys: { openai: '' } }),
    )
  })

  it('saves each change by itself once typing pauses, and says so at the top', async () => {
    const wrapper = mount(SettingsView)
    await flushPromises()
    await wrapper.find('[data-tab="machines"]').trigger('click')
    const address = () => wrapper.find('[data-backend="ollama"] [data-backend-address]')
    const ollamaAt = (address: string) =>
      expect.objectContaining({
        backends: [settings.backends[0], { id: 'ollama', kind: 'ollama', address }],
      })
    expect(wrapper.find('button[type=submit]').exists()).toBe(false)
    await address().setValue('http://192.0.2.20:11434')
    // Nothing yet while typing; once it pauses, one save.
    expect(api.saveSettings).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(700)
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledTimes(1)
    expect(api.saveSettings).toHaveBeenCalledWith(ollamaAt('http://192.0.2.20:11434'))
    expect(wrapper.find('[data-settings-status] [data-saved]').text()).toContain(
      'Applies from the next Session',
    )
    // Turned down: not saved, and why, at the top; nothing is saved again until it changes.
    vi.mocked(api.saveSettings).mockRejectedValueOnce(
      new api.ApiError('Invalid settings', 400, [
        "Backend ollama's address must be like http://127.0.0.1:8188",
      ]),
    )
    await address().setValue('http//oops')
    await vi.advanceTimersByTimeAsync(700)
    await flushPromises()
    expect(wrapper.find('[data-settings-status] [data-save-error]').text()).toContain(
      "Backend ollama's address must be like",
    )
    expect(api.saveSettings).toHaveBeenCalledTimes(2)
    // Put back as it was saved: nothing to save, and the error goes.
    await address().setValue('http://192.0.2.20:11434')
    await vi.advanceTimersByTimeAsync(700)
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
