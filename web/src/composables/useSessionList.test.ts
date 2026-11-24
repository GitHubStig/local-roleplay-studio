import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { loadSessions, useSessionList } from './useSessionList'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  listSessions: vi.fn(),
}))

const summary = (id: string) => ({ id }) as api.SessionSummary

beforeEach(() => vi.resetAllMocks())

describe('loadSessions', () => {
  it('gives a call made during a load the load after it, shared by every such call', async () => {
    const answers: ((list: api.SessionSummary[]) => void)[] = []
    vi.mocked(api.listSessions).mockImplementation(() => new Promise((r) => answers.push(r)))
    const first = loadSessions()
    // Asked for after a change, while the first is still out: it mustn't end with the old list.
    const after = loadSessions()
    const alsoAfter = loadSessions()
    expect(after).toBe(alsoAfter)
    answers[0]([summary('old')])
    await first
    await flushPromises()
    expect(api.listSessions).toHaveBeenCalledTimes(2)
    answers[1]([summary('old'), summary('imported')])
    await after
    expect(useSessionList().sessions.value?.map((s) => s.id)).toEqual(['old', 'imported'])
  })
})
