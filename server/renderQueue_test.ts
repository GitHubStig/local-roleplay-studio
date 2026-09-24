import { assertEquals, assertRejects } from '@std/assert'
import { RenderQueue } from './renderQueue.ts'

const signal = () => new AbortController().signal

Deno.test('RenderQueue lets the first caller straight through', async () => {
  let waited = false
  const release = await new RenderQueue().acquire(signal(), () => (waited = true))
  assertEquals(waited, false)
  release()
})

Deno.test('RenderQueue hands over in order, telling waiters they wait', async () => {
  const queue = new RenderQueue()
  const order: string[] = []
  const first = await queue.acquire(signal())
  const second = queue.acquire(signal(), () => order.push('second waits')).then((r) => {
    order.push('second runs')
    return r
  })
  const third = queue.acquire(signal(), () => order.push('third waits')).then((r) => {
    order.push('third runs')
    return r
  })
  first()
  ;(await second)()
  ;(await third)()
  assertEquals(order, ['second waits', 'third waits', 'second runs', 'third runs'])
})

Deno.test('RenderQueue drops a waiter that aborts, and frees up when idle', async () => {
  const queue = new RenderQueue()
  const first = await queue.acquire(signal())
  const controller = new AbortController()
  const waiting = queue.acquire(controller.signal)
  controller.abort(new Error('Cancelled by player'))
  await assertRejects(() => waiting, Error, 'Cancelled by player')
  first()
  first() // releasing twice is harmless
  let waited = false
  ;(await queue.acquire(signal(), () => (waited = true)))()
  assertEquals(waited, false)
})
