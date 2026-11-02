import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Job } from '../api'
import { useJobLink } from './useJobLink'

const job = (id: string, extra: Partial<Job> = {}): Job => ({
  id,
  kind: 'render',
  frameIndex: 2,
  status: 'queued',
  createdAt: '',
  machine: 'here',
  ...extra,
})

async function linkTo(query: string, jobs: Job[]) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/roleplay/:id', component: { render: () => null } }],
  })
  const to = { go: vi.fn(), edit: vi.fn(), clip: vi.fn(), drop: vi.fn() }
  const ready = ref(false)
  const Screen = defineComponent(() => {
    useJobLink(() => '/roleplay/s1', () => ready.value, ref(jobs), () => Promise.resolve(), to)
    return () => h('div')
  })
  await router.push(`/roleplay/s1?${query}`)
  mount(Screen, { global: { plugins: [router] } })
  await flushPromises()
  expect(to.go).not.toHaveBeenCalled()
  ready.value = true
  await flushPromises()
  return { to, router }
}

describe('useJobLink', () => {
  it('opens a linked job as the Queue tab does, once the Session has loaded, and clears the link', async () => {
    const clip = job('c1', { kind: 'clip' })
    const { to, router } = await linkTo('job=c1&frame=2', [clip])
    expect(to.clip).toHaveBeenCalledWith(clip)
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('dismisses a done job it opens', async () => {
    const done = job('d1', { status: 'done' })
    const { to } = await linkTo('job=d1&frame=2', [done])
    expect([to.go.mock.calls, to.drop.mock.calls]).toEqual([[[2]], [[done]]])
  })

  it('goes to the Frame when the job has gone', async () => {
    const { to } = await linkTo('job=gone&frame=4', [])
    expect(to.go).toHaveBeenCalledWith(4)
  })
})
