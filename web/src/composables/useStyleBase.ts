import { computed, type MaybeRefOrGetter, toValue, type WritableComputedRef } from 'vue'
import { useStoredString } from './storage'

/**
 * The base Frame a Session's style scores are measured against, remembered per Session in this
 * browser: the one picked, while it's still among `frames` (the pictured Frames' indexes), else the
 * first of them. Shared by the Compare dialog's scores and its export.
 */
export function useStyleBase(
  sessionId: string,
  frames: MaybeRefOrGetter<readonly number[]>,
): WritableComputedRef<number> {
  const stored = useStoredString(`style-base:${sessionId}`)
  return computed({
    get: () => {
      const indexes = toValue(frames)
      const picked = Number(stored.value)
      return stored.value !== null && indexes.includes(picked) ? picked : indexes[0] ?? 0
    },
    set: (index: number) => (stored.value = String(index)),
  })
}
