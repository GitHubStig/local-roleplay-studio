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

Deno.test('RenderQueue frees memory on a heavy job’s go, not a light one’s, and runs if it fails', async () => {
  const freed: string[] = []
  let fail = false
  const queue = new RenderQueue({
    freeMemory: (job) => {
      freed.push(job?.kind ?? 'here')
      return fail ? Promise.reject(new Error('Ollama down')) : Promise.resolve()
    },
  })
  ;(await queue.acquire(signal()))()
  ;(await queue.acquire(signal(), undefined, { light: true }))()
  assertEquals(freed, ['here'])
  fail = true
  ;(await queue.acquire(signal(), undefined, { job: { kind: 'upscale' } }))()
  assertEquals(freed, ['here', 'upscale'])
})

Deno.test('RenderQueue lets jobs on different machines run at once', async () => {
  const queue = new RenderQueue({
    machineOf: (job) => Promise.resolve(job?.kind === 'render' ? 'pc' : 'here'),
  })
  const render = { kind: 'render', model: 'moss-image' } as const
  const onPc = await queue.acquire(signal(), undefined, { job: render })
  let waited = false
  const here = await queue.acquire(signal(), () => (waited = true), { light: true })
  assertEquals(waited, false)
  const secondOnPc = queue.acquire(signal(), () => (waited = true), { job: render })
  await Promise.resolve()
  assertEquals(waited, true)
  onPc()
  ;(await secondOnPc)()
  here()
})
