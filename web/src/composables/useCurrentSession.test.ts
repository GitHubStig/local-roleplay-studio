import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

const load = () => import('./useCurrentSession')

describe('useCurrentSession', () => {
  it('remembers the current Session across reloads', async () => {
    ;(await load()).setCurrentSession('s1')
    expect(localStorage.getItem('current-session')).toBe('s1')
    vi.resetModules()
    expect((await load()).useCurrentSession().currentSessionId.value).toBe('s1')
  })

  it('remembers whether it is a Chain or a Storyboard', async () => {
    const m = await load()
    m.setCurrentSession('s1')
    expect(m.useCurrentSession().currentSessionKind.value).toBe('chain')
    m.setCurrentSession('sb', 'storyboard')
    vi.resetModules()
    expect((await load()).useCurrentSession().currentSessionKind.value).toBe('storyboard')
    ;(await load()).clearCurrentSession('sb')
    expect(localStorage.getItem('current-session-kind')).toBeNull()
  })

  it('only forgets the Session it is asked about', async () => {
    const m = await load()
    m.setCurrentSession('s2')
    m.clearCurrentSession('s1')
    expect(m.useCurrentSession().currentSessionId.value).toBe('s2')
    m.clearCurrentSession('s2')
    expect(m.useCurrentSession().currentSessionId.value).toBeNull()
    expect(localStorage.getItem('current-session')).toBeNull()
  })
})
