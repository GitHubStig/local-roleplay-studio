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
    expect(item.text()).toContain("Lead In clip, 5 s · boogu-image-turbo's picture · Frame 2")
    await item.trigger('click')
    expect(wrapper.emitted('clip')).toEqual([[clipJob]])
  })
})
