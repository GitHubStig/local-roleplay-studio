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

describe('useStoredFlag with a fallback of on', () => {
  it('starts on, remembers off, and forgets when back on', async () => {
    const flag = useStoredFlag('test-on', true)
    expect(flag.value).toBe(true)
    flag.value = false
    await nextTick()
    expect(localStorage.getItem('test-on')).toBe('0')
    expect(useStoredFlag('test-on', true).value).toBe(false)
    flag.value = true
    await nextTick()
    expect(localStorage.getItem('test-on')).toBeNull()
  })
})
