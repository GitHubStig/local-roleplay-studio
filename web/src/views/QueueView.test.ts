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
})
