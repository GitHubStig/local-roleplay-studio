/**
 * Rebuilds a test Session from a replay file (`replays/<name>.yaml`) through the running app's HTTP
 * API, as the player would: so it never depends on how `session.json` is laid out. The same
 * Messages with the same seed (the file's, or else a fixed one in Settings) give the same Replies.
 *
 *   deno task replay server/replay/replays/tavern-arrival.yaml [--server <url>] [--no-pictures]
 *
 * A Roleplay with `music` is played with Score as you play (Music must be on in Settings), and its
 * `course` says what the music should do at each Frame: how it went is printed at the end.
 */
import { parse } from '@std/yaml'

/** A replay file: which kind of Session, where it starts, and what the player sends. */
export interface Replay {
  kind: 'roleplay' | 'chain' | 'storyboard'
  /** A Scenario's id (its file name in `scenarios/` or `example-scenarios/`), or a Brief, not both. */
  scenario?: string
  brief?: string
  /** A Roleplay's Messages, in order. */
  messages?: string[]
  /** A Chain's Actions, after its Opening Frame. */
  actions?: string[]
  /** A Storyboard's number of Frames. */
  frameCount?: number
  /** The Session's seed, so a replay gives the same Replies whatever Settings say. */
  seed?: number
  /** Whether to picture and render every Frame afterwards (true unless said otherwise). */
  pictures?: boolean
  /**
   * A Roleplay's music, directed after each Reply (Score as you play), with its own settings; any
   * left out are Settings'.
   */
  music?: { behaviour?: string; taste?: string }
  /**
   * What the music should do at each Frame, the opening first: the answer key the Director's
   * decisions are checked against. Each a `step: why` (`COURSE_STEPS`).
   */
  course?: CourseStep[]
}

/**
 * What the music should do at a Frame: begin (the opening, whatever begins it), hold, change
 * gently or sharply, change either way, fall silent, or anything.
 */
export const COURSE_STEPS = [
  'begin',
  'hold',
  'gentle',
  'sharp',
  'change',
  'silence',
  'any',
] as const
export type CourseStep = { step: (typeof COURSE_STEPS)[number]; why: string }

/** A Frame's decision as the course has it: continue is a hold, a transition its entry. */
export function stepOf(music: { decision: string; entry: string }): string {
  if (music.decision === 'continue') return 'hold'
  return music.decision === 'transition' ? music.entry : music.decision
}

/** Whether a Frame's decision (`stepOf`) keeps to its course step. */
export function keepsTo(expected: CourseStep['step'], decided: string): boolean {
  if (expected === 'any' || expected === 'begin') return true
  if (expected === 'change') return decided === 'gentle' || decided === 'sharp'
  return expected === decided
}

export function parseReplay(text: string): Replay {
  const replay = parse(text) as Replay
  if (!['roleplay', 'chain', 'storyboard'].includes(replay?.kind)) {
    throw new Error('kind must be roleplay, chain or storyboard')
  }
  if (!replay.scenario === !replay.brief) throw new Error('Give either a scenario or a brief')
  if (replay.course) {
    const steps = replay.course as unknown as Record<string, string>[]
    replay.course = steps.map((entry) => {
      const [step, why] = Object.entries(entry ?? {})[0] ?? []
      if (!COURSE_STEPS.includes(step as CourseStep['step'])) {
        throw new Error(`A course step is one of ${COURSE_STEPS.join(', ')}, not ${step}`)
      }
      return { step: step as CourseStep['step'], why: String(why ?? '') }
    })
    const frames = (replay.messages?.length ?? 0) + 1
    if (replay.course.length !== frames) {
      throw new Error(`The course has ${replay.course.length} steps for ${frames} Frames`)
    }
  }
  return replay
}

/** What creates the Session (`POST /api/sessions`). */
export const createBody = (replay: Replay) => ({
  kind: replay.kind,
  ...(replay.scenario ? { scenarioId: replay.scenario } : { brief: replay.brief }),
  ...(replay.frameCount ? { frameCount: replay.frameCount } : {}),
  ...(replay.seed !== undefined ? { seed: replay.seed } : {}),
})

/**
 * What the player would do, step by step: each a request to the app. With `pictures`, a Roleplay's
 * Replies and a Chain's Frames ask for their pictures as they're made, as the page's switches do,
 * and the server queues them; without, none.
 */
export function stepsOf(
  replay: Replay,
  pictures = true,
): { path: string; body?: unknown; what: string }[] {
  if (replay.kind === 'roleplay') {
    const after = { picture: pictures, render: pictures, direct: !!replay.music }
    return [
      { path: 'roleplay/cast', what: 'the Cast' },
      { path: 'roleplay/begin', body: after, what: 'the opening' },
      ...(replay.messages ?? []).map((text, i) => ({
        path: 'roleplay/messages',
        body: { text, ...after },
        what: `Message ${i + 1}`,
      })),
    ]
  }
  if (replay.kind === 'chain') {
    return [
      { path: 'frames', body: { render: pictures }, what: 'the Opening Frame' },
      ...(replay.actions ?? []).map((action, i) => ({
        path: 'frames',
        body: { action, render: pictures },
        what: `Action ${i + 1}`,
      })),
    ]
  }
  return [{ path: 'plan', what: 'the plan' }, { path: 'write', what: 'the Frames' }]
}

/** Reads a work stream (server-sent events) to its end; throws if it failed or was cancelled. */
export async function follow(response: Response): Promise<void> {
  if (!response.ok) {
    throw new Error((await response.json().catch(() => ({}))).error ?? response.statusText)
  }
  const text = await response.text()
  for (const block of text.split('\n\n')) {
    const data = block.split('\n').find((line) => line.startsWith('data: '))
    if (!data) continue
    const event = JSON.parse(data.slice(6))
    if (event.type === 'failed') throw new Error(event.message)
    if (event.type === 'cancelled') throw new Error('cancelled')
  }
}

/** The command line: a replay file, `--server <url>` and `--no-pictures`. */
export function argsOf(argv: string[]) {
  const args = {
    file: undefined as string | undefined,
    server: 'http://127.0.0.1:8787',
    pictures: true,
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--server') args.server = argv[++i]
    else if (argv[i] === '--no-pictures') args.pictures = false
    else args.file = argv[i]
  }
  return args
}

async function main() {
  const args = argsOf(Deno.args)
  const file = args.file
  if (!file) {
    console.error('Usage: deno task replay <replay.yaml> [--server <url>] [--no-pictures]')
    Deno.exit(1)
  }
  const replay = parseReplay(await Deno.readTextFile(file))
  const api = (path: string, init?: RequestInit) =>
    fetch(`${args.server}/api/${path}`, {
      ...init,
      headers: { 'content-type': 'application/json' },
    })

  if (replay.seed === undefined && (await (await api('settings')).json()).seedMode !== 'fixed') {
    console.warn('No seed, and Settings use a random one: the Replies will differ each time.')
  }

  const created = await api('sessions', {
    method: 'POST',
    body: JSON.stringify(createBody(replay)),
  })
  if (!created.ok) throw new Error((await created.json()).error)
  const { id } = await created.json()
  console.log(`Session ${id}`)
  const session = (path: string, body?: unknown) =>
    api(`sessions/${id}/${path}`, { method: 'POST', body: JSON.stringify(body ?? {}) })
  if (replay.music) {
    if (!(await (await api('settings')).json()).music) {
      throw new Error('This replay directs its music: switch Music on in Settings first')
    }
    const { settings } = await (await api(`sessions/${id}`)).json()
    const music = {
      behaviour: replay.music.behaviour ?? settings.musicBehaviour,
      taste: replay.music.taste ?? settings.musicTaste,
    }
    const set = await api(`sessions/${id}/roleplay/music`, {
      method: 'PUT',
      body: JSON.stringify(music),
    })
    if (!set.ok) throw new Error((await set.json()).error)
  }

  const pictures = replay.pictures !== false && args.pictures
  for (const step of stepsOf(replay, pictures)) {
    const start = performance.now()
    await follow(await session(step.path, step.body))
    console.log(`${step.what}: ${((performance.now() - start) / 1000).toFixed(0)} s`)
  }

  // A Roleplay's and a Chain's were queued as each was made; a Storyboard's are asked for now.
  if (pictures && replay.kind === 'storyboard') {
    const { frames } = await (await api(`sessions/${id}`)).json()
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
      const queued = await session('jobs', { kind: 'render', frameIndex })
      if (!queued.ok) console.warn(`render ${frameIndex}: ${(await queued.json()).error}`)
    }
  }
  if (pictures || replay.music) {
    await jobsDone(
      api,
      id,
      [pictures && 'picture and render', replay.music && 'music'].filter(Boolean).join(', '),
    )
  }
  if (replay.course) printCourse(await (await api(`sessions/${id}`)).json(), replay.course)
  console.log(`Done: ${args.server.replace(/\/$/, '')} → Session ${id}`)
}

/** Each Frame's decision beside its course step, and how many kept to it. */
function printCourse(
  session: {
    frames: { index: number; music?: { decision: string; entry: string; line: string } }[]
  },
  course: CourseStep[],
) {
  let kept = 0
  for (const [i, f] of session.frames.entries()) {
    const decided = f.music ? stepOf(f.music) : '(not directed)'
    const ok = keepsTo(course[i].step, decided)
    if (ok) kept++
    console.log(
      `${ok ? '  ' : '✗ '}Frame ${f.index + 1}: ${course[i].step} → ${decided}  (${course[i].why})`,
    )
  }
  console.log(`Kept to the course at ${kept} of ${session.frames.length} Frames`)
}

/** Waits until the Session's job list is empty, checking every few seconds. */
async function jobsDone(api: (path: string) => Promise<Response>, id: string, kind: string) {
  const start = performance.now()
  while (true) {
    const jobs = await (await api(`sessions/${id}/jobs`)).json() as {
      status: string
      error?: string
      frameIndex: number
    }[]
    const failed = jobs.filter((j) => j.status === 'failed')
    if (failed.length) {
      throw new Error(failed.map((j) => `${kind} ${j.frameIndex}: ${j.error}`).join('; '))
    }
    if (!jobs.some((j) => j.status === 'queued' || j.status === 'running')) break
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  console.log(`every ${kind}: ${((performance.now() - start) / 1000).toFixed(0)} s`)
}

if (import.meta.main) await main()
