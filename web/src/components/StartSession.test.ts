import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '../api'
import StartSession from './StartSession.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getScenarios: vi.fn(),
  getSettings: vi.fn(),
  getSettingsOptions: vi.fn(),
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
  textModels: ['llama3:latest'],
  imageModels: [{ id: 'z-image-turbo', label: 'Z-Image Turbo', defaultSteps: 9 }],
  sizePresets: [],
}

const photoshoot = { id: 'photoshoot', title: 'Studio Photoshoot', description: 'Direct a shoot.' }

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:p*', component: {} }],
})
const mountIt = async () => {
  const wrapper = mount(StartSession, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
const startButton = (w: Awaited<ReturnType<typeof mountIt>>) =>
  w.find('button').element as HTMLButtonElement

beforeEach(() => {
  vi.mocked(api.getScenarios).mockResolvedValue({ scenarios: [photoshoot], errors: [] })
  vi.mocked(api.getSettings).mockResolvedValue({ ...settings })
  vi.mocked(api.getSettingsOptions).mockResolvedValue(options)
})

describe('StartSession', () => {
  it('preselects a lone Scenario and emits start', async () => {
    const wrapper = await mountIt()
    expect(wrapper.text()).toContain('Studio Photoshoot')
    expect(startButton(wrapper).disabled).toBe(false)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('start')).toEqual([['photoshoot']])
  })

  it('requires a choice when there are several Scenarios', async () => {
    vi.mocked(api.getScenarios).mockResolvedValue({
      scenarios: [photoshoot, { id: 'other', title: 'Other', description: '' }],
      errors: [],
    })
    const wrapper = await mountIt()
    expect(startButton(wrapper).disabled).toBe(true)
    await wrapper.find('input[value=other]').setValue()
    expect(startButton(wrapper).disabled).toBe(false)
  })

  it('blocks starting until a Text Model is set', async () => {
    vi.mocked(api.getSettings).mockResolvedValue({ ...settings, textModel: '' })
    const wrapper = await mountIt()
    expect(startButton(wrapper).disabled).toBe(true)
    expect(wrapper.text()).toContain('Choose a Text Model in Settings first.')
  })

  it('blocks starting when the Text Model is no longer installed', async () => {
    vi.mocked(api.getSettings).mockResolvedValue({ ...settings, textModel: 'gone:1b' })
    const wrapper = await mountIt()
    expect(startButton(wrapper).disabled).toBe(true)
    expect(wrapper.text()).toContain(`"gone:1b" isn't available`)
  })

  it('reports Scenario files that failed to load', async () => {
    vi.mocked(api.getScenarios).mockResolvedValue({
      scenarios: [photoshoot],
      errors: [{ file: 'broken.md', message: 'title must be a non-empty string' }],
    })
    const wrapper = await mountIt()
    expect(wrapper.find('[role=alert]').text()).toContain('broken.md')
  })
})
