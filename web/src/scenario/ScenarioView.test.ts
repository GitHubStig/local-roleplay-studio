import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '../api'
import ScenarioView from './ScenarioView.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getScenario: vi.fn(),
  expandScenario: vi.fn(),
  createSession: vi.fn(),
  suggestPart: vi.fn(),
  getSettings: vi.fn(() => Promise.resolve({ textModel: 'x' })),
  getSettingsOptions: vi.fn(() => Promise.resolve({ textModels: ['x'] })),
}))

const person = (id: string, name: string, extra: Partial<api.Person> = {}): api.Person => ({
  id,
  name,
  looks: '',
  wears: '',
  personality: '',
  speaks: '',
  background: '',
  goal: '',
  truths: [],
  ...extra,
})

const tavern: api.Scenario = {
  id: 'tavern',
  title: 'The Tavern',
  description: 'A stormy night.',
  opening: 'Kael waits.',
  place: '',
  time: '',
  style: '',
  truths: [],
  people: [person('kael', 'Kael', { goal: 'Find the sender.' })],
  character: 'kael',
}
const expandedTavern: api.Scenario = {
  ...tavern,
  people: [...tavern.people, person('elara', 'Elara')],
  player: 'elara',
}

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: {} },
      { path: '/scenario/:id?', name: 'scenario', component: ScenarioView, props: true },
      { path: '/roleplay/:id', component: {} },
      { path: '/storyboards/:id', component: {} },
    ],
  })
  await router.push(path)
  const wrapper = mount(ScenarioView, {
    props: { id: router.currentRoute.value.params.id as string | undefined },
    global: { plugins: [router] },
  })
  await flushPromises()
  return { wrapper, router }
}

const startButton = (w: Awaited<ReturnType<typeof mountAt>>['wrapper']) =>
  w.find('[data-start]').element as HTMLButtonElement

beforeEach(() => {
  localStorage.clear()
  vi.mocked(api.getScenario).mockReset().mockResolvedValue(structuredClone(tavern))
  vi.mocked(api.expandScenario).mockReset().mockResolvedValue({
    scenario: structuredClone(expandedTavern),
    suggestions: [
      { field: 'time', text: 'A winter night.' },
      { field: 'people.elara.truths', text: 'Elara never lies.' },
    ],
  })
  vi.mocked(api.createSession).mockReset()
})

describe('ScenarioView', () => {
  it("expands a Scenario as it opens, and shows who's who and the suggestions", async () => {
    const { wrapper } = await mountAt('/scenario/tavern')
    expect(api.expandScenario).toHaveBeenCalledWith({ scenarioId: 'tavern' }, expect.anything())
    expect(wrapper.findAll('[data-person]').map((p) => p.attributes('data-person'))).toEqual([
      'kael',
      'elara',
    ])
    expect((wrapper.find('[data-player]').element as HTMLSelectElement).value).toBe('elara')
    expect(wrapper.findAll('[data-suggestion-text]').map((s) => s.text())).toEqual([
      'Suggested: A winter night.',
      'Suggested: Elara never lies.',
    ])
  })

  it('starts a Roleplay from the Scenario as edited, and opens it', async () => {
    vi.mocked(api.createSession).mockResolvedValue({ id: 'r1', kind: 'roleplay' } as api.Session)
    const { wrapper, router } = await mountAt('/scenario/tavern')
    await wrapper.find('[data-field="people.kael.name"]').setValue('Tom')
    await wrapper.findAll('[data-use]')[0].trigger('click')
    await wrapper.findAll('[data-use]')[0].trigger('click')
    // The player swapped to Kael's side: the Text Model's role clears.
    await wrapper.find('[data-player]').setValue('kael')
    await wrapper.find('[data-start]').trigger('click')
    await flushPromises()
    expect(api.createSession).toHaveBeenCalledWith({
      kind: 'roleplay',
      scenarioId: 'tavern',
      scenario: {
        ...expandedTavern,
        time: 'A winter night.',
        people: [
          { ...expandedTavern.people[0], name: 'Tom' },
          { ...expandedTavern.people[1], truths: ['Elara never lies.'] },
        ],
        player: 'kael',
        character: undefined,
      },
    })
    expect(router.currentRoute.value.path).toBe('/roleplay/r1')
  })

  it('asks for a suggestion for any blank part, and for another', async () => {
    vi.mocked(api.suggestPart).mockResolvedValueOnce({ text: 'A goal.' })
      .mockResolvedValueOnce({ text: 'Another goal.' })
    const { wrapper } = await mountAt('/scenario/tavern')
    const goal = () => wrapper.find('[data-person=elara] [data-field="people.elara.goal"]')
    const note = () => goal().element.closest('div')!.querySelector('[data-suggestion]')!
    ;(note().querySelector('[data-suggest]') as HTMLButtonElement).click()
    await flushPromises()
    expect(api.suggestPart).toHaveBeenCalledWith(expandedTavern, 'people.elara.goal')
    expect(note().textContent).toContain('Suggested: A goal.')
    ;(note().querySelector('[data-another]') as HTMLButtonElement).click()
    await flushPromises()
    expect(note().textContent).toContain('Suggested: Another goal.')
    // Nothing to suggest for a part that's written.
    expect(wrapper.find('[data-person=kael] [data-suggest]').exists()).toBe(true)
    expect(wrapper.findAll('[data-person=kael] [data-suggestion]')).toHaveLength(6)
  })

  it('removes a Person, and who they played with them', async () => {
    const { wrapper } = await mountAt('/scenario/tavern')
    await wrapper.find('[data-person=elara] [data-remove-person]').trigger('click')
    expect(wrapper.findAll('[data-person]')).toHaveLength(1)
    expect((wrapper.find('[data-player]').element as HTMLSelectElement).value).toBe('')
  })

  it('blocks Start while it expands, and without an Opening or a name', async () => {
    let answer!: (v: Awaited<ReturnType<typeof api.expandScenario>>) => void
    vi.mocked(api.expandScenario).mockImplementation(() => new Promise((r) => (answer = r)))
    const { wrapper } = await mountAt('/scenario/tavern')
    expect(wrapper.find('[data-expand-status]').exists()).toBe(true)
    expect(startButton(wrapper).disabled).toBe(true)
    answer({ scenario: structuredClone(expandedTavern), suggestions: [] })
    await flushPromises()
    expect(startButton(wrapper).disabled).toBe(false)
    await wrapper.find('[data-field=opening]').setValue(' ')
    expect(wrapper.text()).toContain('Write the Opening.')
    await wrapper.find('[data-field=opening]').setValue('Kael waits.')
    await wrapper.find('[data-add-person]').trigger('click')
    expect(wrapper.text()).toContain('Give every Person a name.')
  })

  it('expands a typed Brief, and starts a Storyboard from it', async () => {
    vi.mocked(api.createSession).mockResolvedValue({ id: 'sb', kind: 'storyboard' } as api.Session)
    const { wrapper, router } = await mountAt('/scenario?brief=A%20dunk.')
    expect(api.expandScenario).toHaveBeenCalledWith({ brief: 'A dunk.' }, expect.anything())
    await wrapper.find('input[value=storyboard]').setValue()
    await wrapper.find('[data-frame-count]').setValue(33)
    expect(wrapper.text()).toContain('1 to 32 Frames')
    await wrapper.find('[data-frame-count]').setValue(6)
    await wrapper.find('[data-start]').trigger('click')
    await flushPromises()
    expect(api.createSession).toHaveBeenCalledWith({
      kind: 'storyboard',
      frameCount: 6,
      brief: 'A dunk.',
      scenario: expandedTavern,
    })
    expect(router.currentRoute.value.path).toBe('/storyboards/sb')
  })

  it("offers Retry when Expand fails, and starts from the Brief alone if it can't", async () => {
    vi.mocked(api.expandScenario).mockRejectedValue(new Error('Ollama is down'))
    vi.mocked(api.createSession).mockResolvedValue({ id: 'r1', kind: 'roleplay' } as api.Session)
    const { wrapper } = await mountAt('/scenario?brief=A%20dunk.')
    expect(wrapper.text()).toContain("Couldn't expand it: Ollama is down")
    expect(wrapper.find('[data-retry-expand]').exists()).toBe(true)
    await wrapper.find('[data-start]').trigger('click')
    expect(api.createSession).toHaveBeenCalledWith({ kind: 'roleplay', brief: 'A dunk.' })
  })

  it('remembers the kind picked last', async () => {
    const first = (await mountAt('/scenario/tavern')).wrapper
    await first.find('input[value=chain]').setValue()
    first.unmount()
    const again = (await mountAt('/scenario/tavern')).wrapper
    expect(startButton(again).textContent?.trim()).toBe('Start Chain')
  })
})
