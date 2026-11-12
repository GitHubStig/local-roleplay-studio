import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '../api'
import QueuePanel from './QueuePanel.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getQueue: vi.fn(),
  cancelJob: vi.fn(() => Promise.resolve([])),
  getSettingsOptions: vi.fn(() => new Promise(() => {})),
}))

enableAutoUnmount(afterEach)

const job = (extra: Partial<api.Queue['jobs'][number]>): api.Queue['jobs'][number] => ({
  id: 'j',
  kind: 'render',
  frameIndex: 0,
  status: 'queued',
  createdAt: '2026-11-12T00:00:00.000Z',
  machine: 'here',
  sessionId: 's1',
  ...extra,
})

async function mountIt(sessionId: string | null) {
  vi.mocked(api.getQueue).mockResolvedValue({
    machines: [{ key: 'here', backends: [] }],
    sessions: [{ id: 's1', kind: 'chain', title: 'The ship' }, {
      id: 's2',
      kind: 'roleplay',
      title: 'The tavern',
    }],
    jobs: [
      job({ id: 'a', frameIndex: 3, status: 'running' }),
      job({ id: 'b', sessionId: 's2', kind: 'upscale' }),
      job({ id: 'c', status: 'done' }),
    ],
    text: [],
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: {} }, { path: '/:p(.*)', component: {} }],
  })
  const wrapper = mount(QueuePanel, {
    props: { open: true, sessionId, 'onUpdate:open': () => {} },
    global: { plugins: [router] },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('QueuePanel', () => {
  it("lists the Session on screen's jobs first, then the others', counting what's finished", async () => {
    const { wrapper } = await mountIt('s1')
    const parts = wrapper.findAll('[data-queue-part]')
    expect(parts.map((p) => p.attributes('data-queue-part'))).toEqual(['here', 'elsewhere'])
    expect(parts[0].text()).toContain('Frame 4 · Render')
    expect(parts[1].text()).toContain('The tavern')
    expect(wrapper.text()).toContain('1 finished')
  })

  it("goes to a job's Frame, and cancels one by its ✕", async () => {
    const { wrapper, router } = await mountIt(null)
    await wrapper.find('[data-queue-job] button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/sessions/s1?job=a&frame=3')
    expect(wrapper.emitted('update:open')).toEqual([[false]])
    await wrapper.findAll('[data-queue-drop]')[1].trigger('click')
    await flushPromises()
    expect(api.cancelJob).toHaveBeenCalledWith('s2', 'b')
  })
})
