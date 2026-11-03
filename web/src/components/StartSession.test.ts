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

const tavern = { id: 'tavern', title: 'The Rain-Soaked Tavern', description: 'A stormy night.' }

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

  it('reports Scenario files that failed to load', async () => {
    vi.mocked(api.getScenarios).mockResolvedValue({
      scenarios: [tavern],
      errors: [{ file: 'broken.md', message: 'title must be a non-empty string' }],
    })
    const { wrapper } = await mountIt()
    expect(wrapper.find('[role=alert]').text()).toContain('broken.md')
  })
})
