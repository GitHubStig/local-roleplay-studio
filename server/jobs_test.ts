import { assertEquals } from '@std/assert'
import { asQueued, type ImageChoice, type Job, SessionJobs } from './jobs.ts'
import type { Session } from './session.ts'

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

const KREA: ImageChoice = { imageModel: 'krea-2', steps: 20 }
const KLEIN: ImageChoice = { imageModel: 'flux2-klein', steps: 4 }

Deno.test('A Frame can be queued to render by two Image Models, each on its machine', () => {
  const { jobs, running } = heldJobs()
  jobs.enqueue('s', 'render', 0, 'here', KREA)
  jobs.enqueue('s', 'render', 0, 'pc', KLEIN)
  // Asking again for one already queued doesn't queue it twice.
  jobs.enqueue('s', 'render', 0, 'pc', KLEIN)
  assertEquals(jobs.list('s').map((j) => j.image?.imageModel), ['krea-2', 'flux2-klein'])
  assertEquals(running(), ['render 0', 'render 0'])
})

Deno.test('A render runs with the Image Model it was queued with', () => {
  const session = {
    settings: { imageModel: 'flux2-klein', steps: 4, seed: 7 },
  } as unknown as Session
  // The kind of Backend it was sent to is the job's, for the page, not the Session's.
  const job = { kind: 'render', image: KREA } as Job
  assertEquals(
    asQueued(session, job).settings,
    { imageModel: 'krea-2', steps: 20, seed: 7 } as unknown as Session['settings'],
  )
  assertEquals(asQueued(session, { kind: 'upscale' } as Job), session)
})

Deno.test('Clips of different kinds on a Frame are separate jobs; the same kind is one', () => {
  const { jobs } = heldJobs()
  const clip = (kind: 'lead-in' | 'idle-loop') => ({ kind, prompt: 'p', seconds: 5, speech: false })
  jobs.enqueue('s', 'clip', 0, 'here', undefined, undefined, clip('lead-in'))
  jobs.enqueue('s', 'clip', 0, 'here', undefined, undefined, clip('idle-loop'))
  jobs.enqueue('s', 'clip', 0, 'here', undefined, undefined, clip('lead-in'))
  assertEquals(jobs.list('s').map((j) => j.clip?.kind), ['lead-in', 'idle-loop'])
})
