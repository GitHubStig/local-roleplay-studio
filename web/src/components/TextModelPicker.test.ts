import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { loadSettingsOptions } from '../composables/useSettingsOptions'
import TextModelPicker from './TextModelPicker.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSettingsOptions: vi.fn(),
  setTextModel: vi.fn(),
}))

type Picked = { id: string; settings: api.SessionSettings }
const session = (textModel: string): Picked => ({
  id: 's1',
  settings: { textModel } as api.SessionSettings,
})

async function mountIt(picked: Picked) {
  const wrapper = mount(TextModelPicker<Picked>, { props: { session: picked } })
  await flushPromises()
  return wrapper
}

beforeEach(async () => {
  vi.mocked(api.getSettingsOptions).mockResolvedValue({
    textModels: ['gemma4:26b', 'llama3:latest'],
  } as api.SettingsOptions)
  vi.mocked(api.setTextModel).mockReset()
  await loadSettingsOptions()
})

enableAutoUnmount(afterEach)

describe('TextModelPicker', () => {
  it("lists the Backend's models, with the Session's own first if it isn't listed", async () => {
    const wrapper = await mountIt(session('qwen3.8:27b-mlx'))
    const select = wrapper.find('[data-text-model]')
    expect(select.findAll('option').map((o) => o.text())).toEqual([
      'qwen3.8:27b-mlx',
      'gemma4:26b',
      'llama3:latest',
    ])
    expect((select.element as HTMLSelectElement).value).toBe('qwen3.8:27b-mlx')
  })

  it('switches the model', async () => {
    vi.mocked(api.setTextModel).mockImplementation((_id, textModel) =>
      Promise.resolve(session(textModel))
    )
    const wrapper = await mountIt(session('gemma4:26b'))
    await wrapper.find('[data-text-model]').setValue('llama3:latest')
    await flushPromises()
    expect(api.setTextModel).toHaveBeenCalledWith('s1', 'llama3:latest')
    expect(wrapper.emitted('switched')?.[0]).toEqual([session('llama3:latest')])
  })

  it('says why a switch failed', async () => {
    vi.mocked(api.setTextModel).mockRejectedValue(new Error('Session not found'))
    const wrapper = await mountIt(session('gemma4:26b'))
    await wrapper.find('[data-text-model]').setValue('llama3:latest')
    await flushPromises()
    expect(wrapper.emitted('failed')?.[0]).toEqual(['Session not found'])
  })
})
