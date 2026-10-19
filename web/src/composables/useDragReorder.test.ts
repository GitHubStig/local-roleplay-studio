import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useDragReorder } from './useDragReorder'

/** A list of three items down the page, 50px each from the top. */
function list() {
  const scroller = document.createElement('ol')
  for (const i of [0, 1, 2]) {
    const item = document.createElement('li')
    item.dataset.item = ''
    item.getBoundingClientRect = () => ({ top: i * 50, bottom: (i + 1) * 50 }) as DOMRect
    scroller.append(item)
  }
  scroller.getBoundingClientRect = () => ({ top: 0, bottom: 150 }) as DOMRect
  return scroller
}

const pointer = (clientY: number) =>
  ({ clientY, pointerId: 1, currentTarget: { setPointerCapture() {} } }) as unknown as PointerEvent

describe('useDragReorder', () => {
  it('moves the dragged item over each it passes, then lets it go', () => {
    const order = ref([0, 1, 2])
    const move = vi.fn((from: number, to: number) => {
      const next = [...order.value]
      next.splice(to, 0, next.splice(from, 1)[0])
      order.value = next
    })
    const end = vi.fn()
    const { dragging, grip } = useDragReorder({
      scroller: ref(list()),
      items: '[data-item]',
      axis: 'y',
      move,
      end,
    })

    grip(0).pointerdown(pointer(20))
    expect(dragging.value).toBe(0)
    grip(0).pointermove(pointer(30)) // Still over itself.
    expect(move).not.toHaveBeenCalled()
    grip(0).pointermove(pointer(70))
    grip(0).pointermove(pointer(120))
    expect(move.mock.calls).toEqual([[0, 1], [1, 2]])
    expect([order.value, dragging.value]).toEqual([[1, 2, 0], 2])

    grip(0).pointerup()
    expect([dragging.value, end.mock.calls.length]).toEqual([null, 1])
    // Not dragging: nothing moves, and it's not let go again.
    grip(0).pointermove(pointer(20))
    grip(0).pointercancel()
    expect([move.mock.calls.length, end.mock.calls.length]).toEqual([2, 1])
  })
})
