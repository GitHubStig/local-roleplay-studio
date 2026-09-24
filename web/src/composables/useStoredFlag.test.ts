import { nextTick } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStoredFlag } from './useStoredFlag'

beforeEach(() => localStorage.clear())

describe('useStoredFlag', () => {
  it('starts off, remembers on, and forgets when turned off', async () => {
    const flag = useStoredFlag('test-flag')
    expect(flag.value).toBe(false)
    flag.value = true
    await nextTick()
    expect(localStorage.getItem('test-flag')).toBe('1')
    expect(useStoredFlag('test-flag').value).toBe(true)
    flag.value = false
    await nextTick()
    expect(localStorage.getItem('test-flag')).toBeNull()
  })
})
