import { assertEquals } from '@std/assert'
import { type Job, SessionJobs } from './jobs.ts'

/** A queue whose jobs run until the test ends them: `started` lists them as `kind frame`. */
function heldJobs() {
  const started: string[] = []
  const ends = new Map<string, () => void>()
  const jobs = new SessionJobs((_id, job) => {
    const name = `${job.kind} ${job.frameIndex}`
    started.push(name)
    return new Promise<void>((resolve) => ends.set(name, resolve))
  })
  /** Ends a running job, and lets the queue start what's next. */
  const end = async (name: string) => {
    ends.get(name)!()
    for (let i = 0; i < 5; i++) await Promise.resolve()
  }
  const running = () =>
    jobs.list('s').filter((j: Job) => j.status === 'running').map((j) =>
      `${j.kind} ${j.frameIndex}`
    )
  return { jobs, started, end, running }
}

Deno.test('Jobs on one machine take turns, in order', async () => {
  const { jobs, started, end } = heldJobs()
  jobs.enqueue('s', 'render', 0)
  jobs.enqueue('s', 'speak', 1)
  assertEquals(started, ['render 0'])
  await end('render 0')
  assertEquals(started, ['render 0', 'speak 1'])
})

Deno.test('A job on another machine runs beside one here', async () => {
  const { jobs, running, end } = heldJobs()
  jobs.enqueue('s', 'render', 0, 'pc')
  jobs.enqueue('s', 'render', 1, 'pc')
  jobs.enqueue('s', 'speak', 2)
  jobs.enqueue('s', 'speak', 3)
  assertEquals(running(), ['render 0', 'speak 2'])
  await end('speak 2')
  assertEquals(running(), ['render 0', 'speak 3'])
  await end('render 0')
  assertEquals(running(), ['render 1', 'speak 3'])
})

Deno.test('A job waits for what it needs on its Frame, wherever that runs', async () => {
  const { jobs, running, end } = heldJobs()
  jobs.enqueue('s', 'picture', 4)
  jobs.enqueue('s', 'render', 4, 'pc')
  jobs.enqueue('s', 'upscale', 4, 'mac')
  // The render waits for its picture, and the upscale for the render, though each has its machine.
  assertEquals(running(), ['picture 4'])
  await end('picture 4')
  assertEquals(running(), ['render 4'])
  await end('render 4')
  assertEquals(running(), ['upscale 4'])
})

Deno.test('Jobs on one machine keep their order behind one that waits', async () => {
  const { jobs, running, end } = heldJobs()
  jobs.enqueue('s', 'picture', 4)
  jobs.enqueue('s', 'render', 4, 'pc')
  jobs.enqueue('s', 'speak', 4, 'pc')
  assertEquals(running(), ['picture 4'])
  await end('picture 4')
  assertEquals(running(), ['render 4'])
})

Deno.test('A spoken line waits for its voice to be designed', async () => {
  const { jobs, running, end } = heldJobs()
  jobs.enqueue('s', 'voice', 0, 'pc')
  jobs.enqueue('s', 'speak', 3, 'mac')
  assertEquals(running(), ['voice 0'])
  await end('voice 0')
  assertEquals(running(), ['speak 3'])
})

Deno.test('A picture put ahead of queued jobs still waits for one running on its machine', async () => {
  const { jobs, running, end } = heldJobs()
  jobs.enqueue('s', 'picture', 0)
  jobs.enqueue('s', 'render', 0, 'pc')
  jobs.enqueue('s', 'speak', 1)
  await end('picture 0')
  assertEquals(running(), ['render 0', 'speak 1'])
  jobs.enqueue('s', 'picture', 2)
  assertEquals(running(), ['render 0', 'speak 1'])
  await end('speak 1')
  assertEquals(running(), ['render 0', 'picture 2'])
})

Deno.test('Between renders waits for every render running, on any machine', async () => {
  const { jobs, end } = heldJobs()
  jobs.enqueue('s', 'render', 0, 'pc')
  jobs.enqueue('s', 'render', 1)
  let done = false
  const between = jobs.betweenRenders('s', () => Promise.resolve(done = true))
  await end('render 0')
  assertEquals(done, false)
  await end('render 1')
  await between
  assertEquals(done, true)
})
