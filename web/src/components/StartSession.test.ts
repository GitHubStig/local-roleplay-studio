import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ask } from '../ask'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '../api'
import { useFeatures } from '../composables/useFeatures'
import { clearScenarioDraft, saveScenarioDraft } from '../composables/useScenarioDraft'
import StartSession from './StartSession.vue'

vi.mock('../ask', () => ({ ask: vi.fn() }))
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getScenarios: vi.fn(),
  deleteScenario: vi.fn(),
  getSettings: vi.fn(),
  getSettingsOptions: vi.fn(),
}))

const tavern = {
  id: 'tavern',
  title: 'The Rain-Soaked Tavern',
  description: 'A stormy night.',
  own: false,
}

const mountIt = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/scenario/:id?', name: 'scenario', component: {} }, {
      path: '/:p*',
      component: {},
    }],
  })
  const wrapper = mount(StartSession, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

const textModel = (name: string) => {
  vi.mocked(api.getSettings).mockResolvedValue({ textModel: name } as api.Settings)
  vi.mocked(api.getSettingsOptions).mockResolvedValue(
    { textModels: ['llama3:latest'] } as api.SettingsOptions,
  )
}

beforeEach(() => {
  vi.mocked(api.getScenarios).mockResolvedValue({ scenarios: [tavern], errors: [] })
  textModel('llama3:latest')
})

describe('StartSession', () => {
  it('opens the Scenario page on a Scenario', async () => {
    const { wrapper, router } = await mountIt()
    await wrapper.find('[data-scenario=tavern]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/scenario/tavern')
  })

  it('asks before another Scenario takes the place of the one being set up', async () => {
    saveScenarioDraft({
      from: { brief: 'A knight.' },
      scenario: { title: 'Fog' } as api.Scenario,
      suggestions: [],
    })
    vi.mocked(ask).mockReset().mockResolvedValue(false)
    const { wrapper, router } = await mountIt()
    await wrapper.find('[data-scenario=tavern]').trigger('click')
    await flushPromises()
    expect(vi.mocked(ask).mock.calls[0][0]).toContain('“Fog”')
    expect(router.currentRoute.value.name).not.toBe('scenario')
    clearScenarioDraft()
  })

  it('opens the Scenario page on a typed Brief', async () => {
    const { wrapper, router } = await mountIt()
    const open = wrapper.find('[data-open-brief]')
    expect(open.attributes('disabled')).toBeDefined()
    await wrapper.find('[data-brief]').setValue('  A knight in fog.  ')
    await open.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('scenario')
    expect(router.currentRoute.value.query).toEqual({ brief: 'A knight in fog.' })
  })

  it('opens nothing until a Text Model is set, and says so', async () => {
    textModel('')
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-blocker]').text()).toBe('Choose a Text Model in Settings first.')
    expect(wrapper.find('[data-scenario=tavern]').attributes('disabled')).toBeDefined()
    textModel('gone:1b')
    const again = (await mountIt()).wrapper
    expect(again.find('[data-blocker]').text()).toContain(`"gone:1b" isn't available`)
  })

  it('opens again as soon as Settings are saved with a Text Model, while still on screen', async () => {
    textModel('')
    const { wrapper } = await mountIt()
    expect(wrapper.find('[data-blocker]').exists()).toBe(true)
    textModel('llama3:latest')
    // What Settings do on each save.
    await useFeatures().refreshFeatures()
    await flushPromises()
    expect(wrapper.find('[data-blocker]').exists()).toBe(false)
    expect(wrapper.find('[data-scenario=tavern]').attributes('disabled')).toBeUndefined()
  })

  it("says when Pictures are on but nothing here can render them, and not when they're off", async () => {
    const pictures = (on: boolean) => {
      vi.mocked(api.getSettings).mockResolvedValue(
        { textModel: 'llama3:latest', features: { images: on } } as api.Settings,
      )
      vi.mocked(api.getSettingsOptions).mockResolvedValue({
        textModels: ['llama3:latest'],
        features: { images: { available: false, reason: 'mflux runs only on Apple Silicon Macs' } },
      } as unknown as api.SettingsOptions)
    }
    pictures(true)
    const on = (await mountIt()).wrapper
    expect(on.find('[data-pictures-blocker]').text()).toContain('mflux runs only on Apple Silicon Macs')
    // Starting still works: Frames are written, to picture later.
    expect(on.find('[data-scenario=tavern]').attributes('disabled')).toBeUndefined()
    pictures(false)
    const off = (await mountIt()).wrapper
    expect(off.find('[data-pictures-blocker]').exists()).toBe(false)
  })

  it('deletes one of your own Scenarios, after asking, but offers no Delete on an example', async () => {
    const mine = { id: 'mine', title: 'Mine', description: '', own: true }
    vi.mocked(api.getScenarios).mockResolvedValue({ scenarios: [tavern, mine], errors: [] })
    vi.mocked(api.deleteScenario).mockResolvedValue()
    vi.mocked(ask).mockReset().mockResolvedValue(true)
    const { wrapper } = await mountIt()
    expect(wrapper.findAll('[data-delete-scenario]')).toHaveLength(1)
    await wrapper.find('[data-delete-scenario]').trigger('click')
    await flushPromises()
    expect(api.deleteScenario).toHaveBeenCalledWith('mine')
  })

  it('lists the Scenario edited last first, saying when', async () => {
    const day = (d: number) => new Date(Date.now() - d * 86400_000).toISOString()
    vi.mocked(api.getScenarios).mockResolvedValue({
      scenarios: [
        { ...tavern, id: 'old', modified: day(3), created: day(9) },
        { ...tavern, id: 'new', modified: day(1), created: day(2) },
      ],
      errors: [],
    })
    const { wrapper } = await mountIt()
    expect(wrapper.findAll('[data-scenario]').map((c) => c.attributes('data-scenario'))).toEqual([
      'new',
      'old',
    ])
    expect(wrapper.find('[data-edited]').text()).toBe('Edited yesterday')
  })

  it('reports Scenario files that failed to load', async () => {
    vi.mocked(api.getScenarios).mockResolvedValue({
      scenarios: [tavern],
      errors: [{ file: 'broken.md', message: 'title must be a non-empty string' }],
    })
    const { wrapper } = await mountIt()
    expect(wrapper.find('[role=alert]').text()).toContain('broken.md')
  })
})
