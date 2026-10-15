import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { saveLine, useAutosave } from './useAutosave'

/** A thing saved on a fake server, which tidies what it's sent (trims it) or refuses it. */
function setup(opts: { refuse?: string } = {}) {
  const saved = ref<Record<number, string>>({ 0: 'zero', 1: 'one' })
  const key = ref(0)
  const calls: [string, unknown][] = []
  const autosave = useAutosave<{ text: string }>({
    source: () => ({ text: saved.value[key.value] }),
    key: () => key.value,
    async save(draft, k) {
      calls.push([draft.text, k])
      await Promise.resolve()
      if (opts.refuse && draft.text.includes(opts.refuse)) throw new Error('That crosses a limit')
      saved.value = { ...saved.value, [k as number]: draft.text.trim() }
      return { text: draft.text.trim() }
    },
    hold: (d) => (d.text.trim() ? null : 'it needs some text'),
    normal: (d) => ({ text: d.text.trim() }),
    name: (k) => `Frame ${(k as number) + 1}`,
  })
  return { saved, key, calls, ...autosave }
}

describe('useAutosave', () => {
  it('saves a changed draft on flush, and nothing when unchanged', async () => {
    const s = setup()
    expect(await s.flush()).toBe(true)
    expect(s.calls).toEqual([])
    s.draft.value!.text = 'zero again '
    expect(s.status.value.kind).toBe('unsaved')
    expect(await s.flush()).toBe(true)
    await nextTick()
    expect(s.calls).toEqual([['zero again ', 0]])
    expect(s.saved.value[0]).toBe('zero again')
    expect([s.draft.value!.text, s.dirty.value, s.status.value.kind])
      .toEqual(['zero again', false, 'saved'])
  })

  it('holds back a draft that cannot be saved, saying why, until it changes', async () => {
    const s = setup()
    s.draft.value!.text = '  '
    expect(await s.flush()).toBe(false)
    expect(s.calls).toEqual([])
    expect(s.status.value).toEqual({ kind: 'refused', why: 'it needs some text' })
    s.draft.value!.text = 'z'
    expect(s.status.value.kind).toBe('unsaved')
  })

  it('keeps a refused draft as typed', async () => {
    const s = setup({ refuse: 'nude' })
    s.draft.value!.text = 'nude'
    expect(await s.flush()).toBe(false)
    expect(s.draft.value!.text).toBe('nude')
    expect(s.status.value).toEqual({ kind: 'refused', why: 'That crosses a limit' })
    expect(s.saved.value[0]).toBe('zero')
  })

  it('saves the old draft to the old key when the key changes', async () => {
    const s = setup()
    s.draft.value!.text = 'zero edited'
    s.key.value = 1
    await nextTick()
    expect(s.draft.value!.text).toBe('one')
    await s.flush()
    expect(s.calls).toEqual([['zero edited', 0]])
    expect(s.saved.value).toEqual({ 0: 'zero edited', 1: 'one' })
  })

  it('names the old key when its save is refused after moving on', async () => {
    const s = setup({ refuse: 'nude' })
    s.draft.value!.text = 'nude'
    s.key.value = 1
    await nextTick()
    await s.flush()
    expect(s.status.value).toEqual({ kind: 'refused', why: 'Frame 1: That crosses a limit' })
  })

  it('reverts to what was there when opened, saving it back', async () => {
    const s = setup()
    s.draft.value!.text = 'first'
    await s.flush()
    await nextTick()
    s.draft.value!.text = 'second'
    await s.flush()
    await nextTick()
    expect(s.canRevert.value).toBe(true)
    await s.revert()
    await nextTick()
    expect([s.saved.value[0], s.draft.value!.text, s.canRevert.value]).toEqual([
      'zero',
      'zero',
      false,
    ])
  })

  it('takes a change made elsewhere, unless the draft has unsaved edits', async () => {
    const s = setup()
    s.saved.value = { ...s.saved.value, 0: 'by an Action' }
    await nextTick()
    expect([s.draft.value!.text, s.canRevert.value]).toEqual(['by an Action', false])
    s.draft.value!.text = 'mine'
    s.saved.value = { ...s.saved.value, 0: 'another tab' }
    await nextTick()
    expect(s.draft.value!.text).toBe('mine')
  })

  it('sends saves one at a time, in order, across drafts sharing a line', async () => {
    const line = saveLine()
    const order: string[] = []
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    const make = (name: string, wait?: Promise<void>) =>
      useAutosave<string>({
        source: () => name,
        async save(draft) {
          order.push(`${draft} start`)
          await wait
          order.push(`${draft} end`)
          return draft
        },
        line,
      })
    const a = make('a', held)
    const b = make('b')
    a.draft.value = 'a2'
    b.draft.value = 'b2'
    const done = Promise.all([a.flush(), b.flush()])
    await flushPromises()
    expect(order).toEqual(['a2 start'])
    release()
    expect(await done).toEqual([true, true])
    expect(order).toEqual(['a2 start', 'a2 end', 'b2 start', 'b2 end'])
  })
})
