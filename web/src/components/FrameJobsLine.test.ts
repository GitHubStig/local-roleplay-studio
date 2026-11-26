import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { Job } from '../api'
import FrameJobsLine from './FrameJobsLine.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getSettingsOptions: vi.fn(() => new Promise(() => {})),
}))

const render = (extra: Partial<Job>): Job =>
  ({ id: 'r', kind: 'render', frameIndex: 1, status: 'running', createdAt: '', ...extra }) as Job

describe('FrameJobsLine', () => {
  it("says a render's name while it renders, and only the step once on its faces", () => {
    const words = (job: Job) =>
      mount(FrameJobsLine, { props: { jobs: [job] } }).get('[data-jobs-line]').text()
    expect(words(render({ phase: 'image' }))).toBe('Render · Rendering…')
    expect(
      words(
        render({
          phase: 'faces',
          faces: { subjects: ['Kael', 'Elara'] },
          progress: { step: 3, total: 50 },
        }),
      ),
    ).toBe('Faces · Kael and Elara… step 3 of 50')
  })

  it('says the faces were skipped on a done render, with its dismiss', () => {
    const wrapper = mount(FrameJobsLine, {
      props: {
        jobs: [
          render({
            status: 'done',
            faces: { subjects: [], skipped: 'No one with a sheet in it.' },
          }),
        ],
      },
    })
    expect(wrapper.get('[data-jobs-line]').text()).toBe('Faces skipped')
    expect(wrapper.find('[data-jobs-line-dismiss]').exists()).toBe(true)
  })
})
