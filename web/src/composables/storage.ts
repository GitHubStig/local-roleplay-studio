import { type StorageLike, useStorage } from '@vueuse/core'
import type { Ref } from 'vue'

/** Stands in for localStorage when the browser won't let us use it: nothing survives a reload. */
function memoryStorage(): StorageLike {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  }
}

let browser: StorageLike | undefined

/**
 * The browser's localStorage, or an in-memory stand-in if it's blocked. Even reading
 * `window.localStorage` can throw (cookies blocked, some private modes), so it's tried once, here,
 * instead of by each caller.
 */
export function browserStorage(): StorageLike {
  if (browser) return browser
  try {
    const storage = window.localStorage
    storage.getItem('')
    browser = storage
  } catch {
    browser = memoryStorage()
  }
  return browser
}

/**
 * A string remembered per browser under `key`, or null when there's nothing stored; setting null
 * removes it. Every remembered value in the app goes through here, so they all behave the same:
 *
 * - saved at once (`flush: 'sync'`), so a reload right after a change never loses it;
 * - nothing written until something is set (`writeDefaults: false`);
 * - not synced from other tabs (`listenToStorageChanges: false`): each tab keeps its own draft and
 *   its own place, and VueUse's syncing also drops a second change made in the same tick.
 */
export function useStoredString(key: string): Ref<string | null> {
  return useStorage<string | null>(key, null, browserStorage(), {
    writeDefaults: false,
    flush: 'sync',
    listenToStorageChanges: false,
  })
}
