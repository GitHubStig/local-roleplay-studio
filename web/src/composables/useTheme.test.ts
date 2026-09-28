import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let systemDark = false
const listeners: ((e: { matches: boolean }) => void)[] = []

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  document.documentElement.className = ''
  systemDark = false
  listeners.length = 0
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return systemDark
    },
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
    removeEventListener: () => {},
  }))
})

afterEach(() => vi.unstubAllGlobals())

const load = async () => (await import('./useTheme')).useTheme()
const isDark = () => document.documentElement.classList.contains('dark')

describe('useTheme', () => {
  it('follows the system by default', async () => {
    systemDark = true
    const { preference } = await load()
    expect(preference.value).toBe('system')
    expect(isDark()).toBe(true)
  })

  it('tracks system changes while on system', async () => {
    await load()
    expect(isDark()).toBe(false)
    systemDark = true
    listeners.forEach((fn) => fn({ matches: systemDark }))
    await nextTick()
    expect(isDark()).toBe(true)
  })

  it('applies and remembers an explicit choice', async () => {
    systemDark = true
    const { preference } = await load()
    preference.value = 'light'
    await nextTick()
    expect(isDark()).toBe(false)
    expect(localStorage.getItem('theme')).toBe('light')
    listeners.forEach((fn) => fn({ matches: systemDark }))
    expect(isDark()).toBe(false)
  })

  it('restores a saved choice, and stores "auto" when set back to system', async () => {
    localStorage.setItem('theme', 'dark')
    const { preference } = await load()
    expect(preference.value).toBe('dark')
    expect(isDark()).toBe(true)
    preference.value = 'system'
    await nextTick()
    // index.html's pre-paint script treats anything but light/dark as "follow the system".
    expect(localStorage.getItem('theme')).toBe('auto')
    expect(isDark()).toBe(false)
  })
})
