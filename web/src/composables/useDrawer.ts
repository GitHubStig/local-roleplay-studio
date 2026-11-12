import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'
import { useStoredString } from './storage'

/**
 * A Session screen's drawer (`SessionDrawer`): which tab is open, or none, remembered per browser
 * under `key`. Never opened or closed yet, it starts open at `first` on a screen wide enough for it
 * beside a full-height picture (2560 px), and closed otherwise. A tab the screen can't show now
 * (`shows`) reads as closed. `toggle` opens a tab, or closes it if it's the one open.
 */
export function useDrawer<T extends string>(
  key: string,
  first: T,
  shows: (tab: T) => boolean = () => true,
) {
  const stored = useStoredString(key)
  const wide = useMediaQuery('(min-width: 2560px)')
  const tab = computed<T | null>({
    get: () => {
      const now = (stored.value ?? (wide.value ? first : 'closed')) as T | 'closed'
      return now === 'closed' || !shows(now) ? null : now
    },
    set: (t) => (stored.value = t ?? 'closed'),
  })
  const toggle = (t: T) => (tab.value = tab.value === t ? null : t)
  return { tab, toggle }
}
