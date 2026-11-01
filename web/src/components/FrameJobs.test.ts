import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { Job } from '../api'
import FrameJobs from './FrameJobs.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getSettingsOptions: vi.fn(() => new Promise(() => {})),
}))

const job = (status: Job['status']): Job =>
  ({ id: status, kind: 'render', frameIndex: 1, status, createdAt: '' }) as Job

describe('FrameJobs', () => {
  it('shows a running job as a spinner that cancels it, and a queued one as a cross', async () => {
    const wrapper = mount(FrameJobs, { props: { jobs: [job('running'), job('queued')] } })
    const [running, queued] = wrapper.findAll('[data-drop-job]')
    expect(running.attributes('title')).toBe('Cancel')
    // The spinner, until hovered or focused; and beside the button on a screen that can't hover.
    expect(running.find('[data-job-spinner]').exists()).toBe(true)
    expect(wrapper.findAll('[data-job-working]')).toHaveLength(1)
    expect(queued.attributes('title')).toBe('Remove from queue')
    expect(queued.find('[data-job-spinner]').exists()).toBe(false)
    await running.trigger('click')
    expect(wrapper.emitted('drop')).toEqual([[job('running')]])
  })
})
