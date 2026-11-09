import { assertEquals } from '@std/assert'
import {
  asQueued,
  type ImageChoice,
  type Job,
  onModelPictures,
  type QueueStore,
  type SavedQueue,
  SessionJobs,
} from './jobs.ts'
import type { ComfyTraces } from './comfyui/traces.ts'
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

Deno.test('A render goes ahead of queued clips, but not of a clip on its own Frame', async () => {
  const { jobs, started, end } = heldJobs()
  jobs.enqueue('s', 'render', 0, 'pc')
  jobs.enqueue('s', 'clip', 0, 'pc')
  jobs.enqueue('s', 'clip', 1, 'pc')
  jobs.enqueue('s', 'render', 2, 'pc')
  jobs.enqueue('s', 'edit', 1, 'pc')
  await end('render 0')
  await end('render 2')
  await end('clip 0')
  await end('clip 1')
  // The edit of Frame 1 stays behind its clip, which is made from the picture as it was asked for.
  assertEquals(started, ['render 0', 'render 2', 'clip 0', 'clip 1', 'edit 1'])
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

Deno.test('A clip waits only for its own Image Model’s render of its Frame, and is one per model', async () => {
  const { jobs, running, end } = heldJobs()
  const leadIn = { kind: 'lead-in' as const, prompt: 'p', seconds: 5, speech: false }
  jobs.enqueue('s', 'render', 0, 'mac', KREA)
  jobs.enqueue('s', 'render', 1, 'pc', KLEIN)
  jobs.enqueue('s', 'clip', 0, 'pc-video', KLEIN, undefined, leadIn)
  jobs.enqueue('s', 'clip', 1, 'pc-video', KLEIN, undefined, leadIn)
  // Frame 0's clip is of FLUX.2 Klein's picture: Krea's render doesn't hold it up. Frame 1's is.
  assertEquals(running(), ['render 0', 'render 1', 'clip 0'])
  // The same kind of clip for another model's picture is other work.
  jobs.enqueue('s', 'clip', 0, 'pc-video', KREA, undefined, leadIn)
  assertEquals(jobs.list('s').filter((j) => j.kind === 'clip').length, 3)
  await end('render 1')
  await end('clip 0')
  assertEquals(running(), ['render 0', 'clip 1'])
})

Deno.test('A done job stays listed until dismissed; Dismiss finished leaves what’s open', async () => {
  const { jobs, end } = heldJobs()
  const render = jobs.enqueue('s', 'render', 0)
  jobs.enqueue('s', 'speak', 1)
  await end('render 0')
  const status = () => jobs.list('s').map((j) => `${j.kind} ${j.status}`)
  assertEquals(status(), ['render done', 'speak running'])
  // The same work is queued again, not taken for the done job.
  assertEquals(jobs.enqueue('s', 'render', 0).id === render.id, false)
  jobs.dismissFinished('s')
  assertEquals(status(), ['speak running', 'render queued'])
  // Dismissing one done job by id leaves the others.
  await end('speak 1')
  assertEquals(jobs.cancel('s', jobs.list('s')[0].id), true)
  assertEquals(status(), ['render running'])
})

/** A queue store in memory: what was saved last. */
function memoryQueue(saved: SavedQueue = []) {
  const store = {
    saved,
    load: () => Promise.resolve(structuredClone(store.saved)),
    save: (queue: SavedQueue) => {
      store.saved = structuredClone(queue)
      return Promise.resolve()
    },
  }
  return store satisfies QueueStore
}

Deno.test('The queue is saved as it changes, with what a running job left on ComfyUI', async () => {
  const store = memoryQueue()
  const ends: (() => void)[] = []
  const jobs = new SessionJobs(
    (_id, _job, emit) => {
      emit({ type: 'progress', step: 1, total: 4 })
      emit({ type: 'comfy', comfy: { prompt: { base: 'http://pc', promptId: 'p1' } } })
      return new Promise<void>((resolve) => ends.push(resolve))
    },
    undefined,
    store,
  )
  jobs.enqueue('s', 'render', 0, 'pc')
  jobs.enqueue('s', 'render', 1, 'pc')
  await jobs.saved()
  const [running, queued] = store.saved[0].jobs
  assertEquals([running.status, running.comfy?.prompts], ['running', [
    { base: 'http://pc', promptId: 'p1' },
  ]])
  assertEquals(queued.status, 'queued')
  // Once it ends, what it left is its own to have cleaned up.
  ends[0]()
  for (let i = 0; i < 5; i++) await Promise.resolve()
  await jobs.saved()
  assertEquals(store.saved[0].jobs.map((j) => [j.status, !!j.comfy]), [['done', false], [
    'running',
    true,
  ]])
})

Deno.test('A restart puts the queue back, cleaning up after a job cut off and running it again', async () => {
  const traces: ComfyTraces = { prompts: [{ base: 'http://pc', promptId: 'p1' }], uploads: [] }
  const job = (id: string, extra: Partial<Job>): Job => ({
    id,
    kind: 'render',
    frameIndex: 0,
    status: 'queued',
    createdAt: '2026-11-02T10:00:00.000Z',
    machine: 'pc',
    ...extra,
  })
  const store = memoryQueue([
    {
      sessionId: 's',
      jobs: [
        job('done', { status: 'done', endedAt: '2026-11-02T10:01:00.000Z' }),
        job('cut', {
          status: 'running',
          phase: 'image',
          startedAt: '2026-11-02T10:02:00.000Z',
          comfy: traces,
        }),
        job('next', { frameIndex: 1 }),
      ],
    },
    { sessionId: 'gone', jobs: [job('lost', {})] },
  ])
  const started: string[] = []
  const jobs = new SessionJobs(
    (_id, j) => {
      started.push(j.id)
      return new Promise(() => {})
    },
    undefined,
    store,
  )
  const cleared: ComfyTraces[] = []
  await jobs.restore((id) => Promise.resolve(id === 's'), (t) => {
    cleared.push(t)
    return Promise.resolve()
  })
  assertEquals(cleared, [traces])
  assertEquals(started, ['cut'])
  const listed = jobs.list('s')
  assertEquals(listed.map((j) => [j.id, j.status]), [['done', 'done'], ['cut', 'running'], [
    'next',
    'queued',
  ]])
  assertEquals(listed[1].comfy, undefined)
  assertEquals(jobs.list('gone'), [])
})

Deno.test('A clip cut off by a restart is queued to pick up its result, not cleaned up', async () => {
  const left: ComfyTraces = { prompts: [{ base: 'http://pc', promptId: 'p1' }], uploads: [] }
  const store = memoryQueue([{
    sessionId: 's',
    jobs: [{
      id: 'clip',
      kind: 'clip',
      frameIndex: 0,
      status: 'running',
      startedAt: '2026-11-02T10:02:00.000Z',
      createdAt: '2026-11-02T10:00:00.000Z',
      machine: 'pc',
      comfy: left,
    }],
  }])
  const runs: (Job | undefined)[] = []
  const jobs = new SessionJobs(
    (_id, j) => {
      runs.push(structuredClone(j))
      return Promise.resolve()
    },
    undefined,
    store,
  )
  const cleared: ComfyTraces[] = []
  await jobs.restore(() => Promise.resolve(true), (t) => {
    cleared.push(t)
    return Promise.resolve()
  })
  assertEquals(cleared, [])
  assertEquals(runs[0]?.resume, left)
  for (let i = 0; i < 5; i++) await Promise.resolve()
  assertEquals(jobs.list('s')[0].resume, undefined)
})

Deno.test("The work on a model's pictures is what would act on them, there or still to come", () => {
  const job = (id: string, kind: Job['kind'], frameIndex: number, imageModel?: string) =>
    ({
      id,
      kind,
      frameIndex,
      status: 'queued',
      ...(imageModel && { image: { imageModel } }),
    }) as Job
  const session = (...frames: string[][]) =>
    ({
      settings: { imageModel: 'own' },
      frames: frames.map((models, index) => ({
        index,
        pictures: models.map((imageModel) => ({ image: `${imageModel}.png`, imageModel })),
      })),
    }) as unknown as Session
  const upscale = job('up', 'upscale', 0)
  const picked = (s: Session, ...jobs: Job[]) => onModelPictures(s, 'old', jobs)(upscale)

  // The picture the Frame shows.
  assertEquals(picked(session(['old']), upscale), true)
  assertEquals(picked(session(['old', 'new']), upscale), false)
  assertEquals(picked(session(['old', 'own']), upscale), false)
  // Nothing there: the render it's waiting on.
  assertEquals(picked(session([]), job('r', 'render', 0, 'old'), upscale), true)
  assertEquals(picked(session([]), job('r', 'render', 0, 'new'), upscale), false)
  // A picture by the Session's own model on its way is what the Frame will show.
  assertEquals(picked(session(['old']), job('r', 'render', 0, 'own'), upscale), false)
  assertEquals(picked(session(['old']), job('p', 'picture', 0), upscale), false)
  // Only what's ahead of it, on its Frame, and still to come.
  assertEquals(picked(session([]), upscale, job('r', 'render', 0, 'old')), false)
  assertEquals(picked(session([], []), job('r', 'render', 1, 'old'), upscale), false)
  const failed = { ...job('r', 'render', 0, 'old'), status: 'failed' } as Job
  assertEquals(picked(session([]), failed, upscale), false)
  // Jobs that record their model go by it; others on no picture aren't touched.
  assertEquals(onModelPictures(session(['own']), 'old', [])(job('c', 'clip', 0, 'old')), true)
  assertEquals(onModelPictures(session(['old']), 'old', [])(job('s', 'speak', 0)), false)
})

Deno.test('Work waits for the jobs cancelled to end, and even one that finished anyway goes', async () => {
  const { jobs, end, started } = heldJobs()
  jobs.enqueue('s', 'render', 0)
  jobs.enqueue('s', 'render', 1)
  jobs.enqueue('s', 'speak', 2)
  let worked = false
  const done = jobs.without('s', (j) => j.kind === 'render', () => {
    worked = true
    return Promise.resolve('worked')
  })
  // These jobs don't heed the cancel: the first is still running, and the queued one has gone.
  await Promise.resolve()
  assertEquals(worked, false)
  assertEquals(jobs.list('s').map((j) => j.frameIndex), [0, 2])
  await end('render 0')
  assertEquals(await done, 'worked')
  // The queue, held till then, goes on with what's left.
  assertEquals(jobs.list('s').map((j) => j.frameIndex), [2])
  assertEquals(started, ['render 0', 'speak 2'])
})
