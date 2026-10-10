import { nextTick, type ShallowRef } from 'vue'

/**
 * ↑ and ↓ in a list of Frames (`list`, whose picked Frame has `aria-current="true"`): pick the
 * Frame before or after the one shown (`current`, of `count`), and keep the focus on it, so holding
 * a key runs through them. Returns the list's keydown handler.
 */
export function useFrameKeys(
  list: Readonly<ShallowRef<HTMLElement | null>>,
  opts: { count: () => number; current: () => number; pick: (index: number) => void },
) {
  return async (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const next = opts.current() + (e.key === 'ArrowUp' ? -1 : 1)
    if (next < 0 || next >= opts.count()) return
    opts.pick(next)
    await nextTick()
    list.value?.querySelector<HTMLElement>('[aria-current="true"]')?.focus()
  }
}
