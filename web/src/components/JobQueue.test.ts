import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { Job } from '../api'
import JobQueue from './JobQueue.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getSettingsOptions: vi.fn(() => new Promise(() => {})),
}))

const clipJob: Job = {
  id: 'j1',
  kind: 'clip',
  frameIndex: 2,
  status: 'queued',
  createdAt: '',
  image: { imageModel: 'boogu-image-turbo', steps: 8 },
  clip: { kind: 'lead-in', prompt: 'She walks in.', seconds: 5, speech: false },
} as Job

describe('JobQueue', () => {
  it("names a clip by its kind, length and whose picture it's of, and hands it on when clicked", async () => {
    const wrapper = mount(JobQueue, { props: { jobs: [clipJob], empty: '' } })
    const item = wrapper.find('[data-queue-item] button')
    expect(item.text()).toContain("Lead In clip, 5 s · boogu-image-turbo's picture · Frame 3")
    await item.trigger('click')
    expect(wrapper.emitted('clip')).toEqual([[clipJob]])
  })

  describe('with a job done', () => {
    const done: Job = { ...clipJob, id: 'j2', kind: 'render', status: 'done', clip: undefined }

    it('goes to its Frame and dismisses it, as seen', async () => {
      const wrapper = mount(JobQueue, { props: { jobs: [done], empty: '' } })
      const item = wrapper.find('[data-queue-item]')
      expect(item.text()).toContain('Done')
      await item.find('button').trigger('click')
      expect(wrapper.emitted('go')).toEqual([[2]])
      expect(wrapper.emitted('drop')).toEqual([[done]])
    })

    it('is dismissed with Dismiss done, which Clear queue leaves to the jobs still open', async () => {
      const onlyDone = mount(JobQueue, { props: { jobs: [done], empty: '' } })
      expect(onlyDone.find('[data-clear-queue]').exists()).toBe(false)
      await onlyDone.find('[data-dismiss-done]').trigger('click')
      expect(onlyDone.emitted('dismissDone')).toHaveLength(1)

      const mixed = mount(JobQueue, { props: { jobs: [done, clipJob], empty: '' } })
      expect(mixed.find('[data-clear-queue]').exists()).toBe(true)
      expect(mixed.find('[data-queue-actions-separator]').exists()).toBe(true)
      expect(onlyDone.find('[data-queue-actions-separator]').exists()).toBe(false)
      const open = mount(JobQueue, { props: { jobs: [clipJob], empty: '' } })
      expect(open.find('[data-dismiss-done]').exists()).toBe(false)
    })
  })
})
