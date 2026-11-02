import type { JobKind, Queue } from './api'

/** A job as the queue page lists it: with its Session's id. */
export type QueueJob = Queue['jobs'][number]
/** A Text Model call as the queue page lists it. */
export type TextCall = Queue['text'][number]
export type QueueSession = Queue['sessions'][number]

/** What each Text Model call is for, as the call log names it (`ChatCall.job`). */
const TEXT_CALL_NAMES: Record<string, string> = {
  reply: 'Reply',
  cast: 'Cast',
  look: 'Look',
  picture: 'Image Prompt',
  voice: 'Voice description',
  delivery: 'Directing a line',
  suggest: 'Suggest',
  plan: 'Plan',
  write: 'Frame',
  'write-frame': 'Frame',
  edit: 'Prompt edit',
  clip: 'Clip prompt',
}
export const textCallName = (job: string) => TEXT_CALL_NAMES[job] ?? 'Text'

/** The jobs whose own text calls these are: a picture's Look and Image Prompt, a voice's lines. */
const CALLS_OF_JOBS: Record<string, readonly JobKind[]> = {
  picture: ['picture'],
  look: ['picture'],
  voice: ['voice', 'speak', 'speak-thought'],
  delivery: ['speak', 'speak-thought'],
}

/** Whether `call` is a running job's own (`CALLS_OF_JOBS`), listed as the job instead. */
const ofAJob = (call: TextCall, jobs: readonly QueueJob[]) =>
  jobs.some((j) =>
    j.sessionId === call.session && j.status === 'running' &&
    !!CALLS_OF_JOBS[call.job]?.includes(j.kind)
  )

export type QueueRow =
  | { type: 'job'; job: QueueJob; session?: QueueSession }
  | { type: 'text'; call: TextCall; session?: QueueSession }

/** One machine's line: what runs, what waits in the order it goes, and what's finished. */
export interface MachineQueue {
  key: string
  /** `This machine` for the server's own, else its host. */
  name: string
  /** The kinds of Backend Settings list on it, the server's own programs aside. */
  backends: string[]
  running: QueueRow[]
  waiting: QueueRow[]
  /** Done and failed, the latest first. */
  finished: QueueRow[]
}

const by = <T>(key: (t: T) => string) => (a: T, b: T) => key(a).localeCompare(key(b))

/**
 * Every machine's line, from the queue (`GET /api/queue`): the machines Settings list, in their
 * order, then any other a job or call runs on. Waiting go in the order they will: the Text Model's
 * calls first (a job's own listed as the job), then jobs waiting their turn (clips last), then jobs still queued, each in its
 * Session's order.
 */
export function machineQueues(queue: Queue): MachineQueue[] {
  const sessions = new Map(queue.sessions.map((s) => [s.id, s]))
  const job = (j: QueueJob): QueueRow => ({
    type: 'job',
    job: j,
    session: sessions.get(j.sessionId),
  })
  const text = (c: TextCall): QueueRow => ({
    type: 'text',
    call: c,
    session: c.session ? sessions.get(c.session) : undefined,
  })
  const keys = [
    ...new Set([
      ...queue.machines.map((m) => m.key),
      ...queue.jobs.map((j) => j.machine),
      ...queue.text.map((c) => c.machine),
    ]),
  ]
  return keys.map((key) => {
    const jobs = queue.jobs.filter((j) => j.machine === key)
    const calls = queue.text.filter((c) => c.machine === key && !ofAJob(c, queue.jobs))
    const inTurn = jobs.filter((j) => j.status === 'running' && j.phase === 'queued')
      .sort(by((j) => `${j.kind === 'clip' ? 1 : 0} ${j.startedAt}`))
    return {
      key,
      name: key === 'here' ? 'This machine' : key,
      backends: (queue.machines.find((m) => m.key === key)?.backends ?? [])
        .filter((b) => b !== 'This machine'),
      running: [
        ...calls.filter((c) => c.status === 'running').map(text),
        ...jobs.filter((j) => j.status === 'running' && j.phase !== 'queued').map(job),
      ],
      waiting: [
        ...calls.filter((c) => c.status === 'waiting').map(text),
        ...inTurn.map(job),
        ...jobs.filter((j) => j.status === 'queued').map(job),
      ],
      finished: jobs.filter((j) => j.status === 'done' || j.status === 'failed')
        .sort(by((j) => j.endedAt ?? ''))
        .reverse()
        .map(job),
    }
  })
}

/** How long from `from` to `to` (ISO times), as "12 s" or "3 min 5 s". */
export function lasted(from: string, to: string | number): string {
  const end = typeof to === 'number' ? to : Date.parse(to)
  const s = Math.max(0, Math.round((end - Date.parse(from)) / 1000))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`
}
