import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as api from '../api'
import QueueView from './QueueView.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getQueue: vi.fn(),
  getSettingsOptions: vi.fn(() => new Promise(() => {})),
  cancelJob: vi.fn(() => Promise.resolve([])),
}))

enableAutoUnmount(afterEach)

const queue: api.Queue = {
  machines: [{ key: 'here', backends: ['This machine', 'Ollama'] }],
  sessions: [{ id: 's1', kind: 'roleplay', title: 'The tavern' }],
  jobs: [{
    id: 'j1',
    kind: 'upscale',
    frameIndex: 2,
    status: 'running',
    phase: 'image',
    createdAt: '2026-11-02T10:00:00.000Z',
    startedAt: '2026-11-02T10:00:05.000Z',
    machine: 'here',
    sessionId: 's1',
  }],
  text: [{
    machine: 'here',
    session: 's1',
    job: 'reply',
    status: 'waiting',
    since: '2026-11-02T10:00:06.000Z',
  }],
}

describe('QueueView', () => {
  it('shows each machine’s line, a job linking to its Frame in its Session, and cancels one', async () => {
    vi.mocked(api.getQueue).mockResolvedValue(queue)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)', component: { render: () => null } }],
    })
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('[data-machine-name]').text()).toBe('This machine')
    expect(wrapper.find('[data-section="running"]').text()).toContain('Upscale · Frame 3')
    expect(wrapper.find('[data-section="running"] a').attributes('href')).toBe(
      '/roleplay/s1?job=j1&frame=2',
    )
    const waiting = wrapper.find('[data-section="waiting"]').text()
    expect(waiting).toContain('Reply')
    expect(waiting).toContain('Waiting for the job running')
    await wrapper.find('[data-section="running"] button').trigger('click')
    expect(api.cancelJob).toHaveBeenCalledWith('s1', 'j1')
  })

  it('lists the machines down the left, opening on the first with work, and shows the one picked', async () => {
    localStorage.clear()
    vi.mocked(api.getQueue).mockResolvedValue({
      ...queue,
      machines: [{ key: 'here', backends: [] }, { key: 'pc', backends: ['ComfyUI'] }],
      jobs: [{ ...queue.jobs[0], machine: 'pc' }],
      text: [],
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)', component: { render: () => null } }],
    })
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()
    const tabs = wrapper.findAll('[data-machine-tab]')
    expect(tabs.map((t) => t.text())).toEqual(['This machineIdle', 'pc1 running'])
    expect(wrapper.find('[data-machine-name]').text()).toBe('pc')
    await tabs[0].trigger('click')
    expect(wrapper.find('[data-machine-name]').text()).toBe('This machine')
    expect(wrapper.find('[data-machine]').text()).toContain('Idle.')
  })

  it('cancels a machine’s running and waiting jobs at once, waiting first, and dismisses its finished', async () => {
    const at = '2026-11-02T10:00:00.000Z'
    const base = { frameIndex: 0, createdAt: at, machine: 'here', sessionId: 's1' } as const
    vi.mocked(api.getQueue).mockResolvedValue({
      ...queue,
      jobs: [
        { ...base, id: 'run', kind: 'render', status: 'running', phase: 'image', startedAt: at },
        { ...base, id: 'wait', kind: 'render', status: 'queued' },
        { ...base, id: 'done', kind: 'upscale', status: 'done', startedAt: at, endedAt: at },
        { ...base, id: 'fail', kind: 'upscale', status: 'failed', startedAt: at, endedAt: at },
      ],
    })
    vi.mocked(api.cancelJob).mockClear()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)', component: { render: () => null } }],
    })
    const wrapper = mount(QueueView, { global: { plugins: [router] } })
    await flushPromises()
    // The text call waiting isn't counted: its screen cancels it.
    const cancel = wrapper.find('[data-section-action="running"]')
    expect(cancel.text()).toBe('Cancel all (2)')
    expect(wrapper.find('[data-section-action="waiting"]').exists()).toBe(false)
    await cancel.trigger('click')
    await flushPromises()
    expect(vi.mocked(api.cancelJob).mock.calls.map(([, id]) => id)).toEqual(['wait', 'run'])
    vi.mocked(api.cancelJob).mockClear()
    const dismiss = wrapper.find('[data-section-action="finished"]')
    expect(dismiss.text()).toBe('Dismiss all (2)')
    await dismiss.trigger('click')
    await flushPromises()
    expect(vi.mocked(api.cancelJob).mock.calls.map(([, id]) => id)).toEqual(['fail', 'done'])
  })
})
