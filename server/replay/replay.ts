/**
 * Rebuilds a test Session from a replay file (`replays/<name>.yaml`) through the running app's HTTP
 * API, as the player would: so it never depends on how `session.json` is laid out. The same
 * Messages with the same seed (the file's, or else a fixed one in Settings) give the same Replies.
 *
 *   deno task replay server/replay/replays/tavern-arrival.yaml [--server <url>] [--no-pictures]
 */
import { parse } from '@std/yaml'

/** A replay file: which kind of Session, where it starts, and what the player sends. */
export interface Replay {
  kind: 'roleplay' | 'chain' | 'storyboard'
  /** A Scenario's id (its file name in `scenarios/`), or a Brief, not both. */
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
}

export function parseReplay(text: string): Replay {
  const replay = parse(text) as Replay
  if (!['roleplay', 'chain', 'storyboard'].includes(replay?.kind)) {
    throw new Error('kind must be roleplay, chain or storyboard')
  }
  if (!replay.scenario === !replay.brief) throw new Error('Give either a scenario or a brief')
  return replay
}

/** What creates the Session (`POST /api/sessions`). */
export const createBody = (replay: Replay) => ({
  kind: replay.kind,
  ...(replay.scenario ? { scenarioId: replay.scenario } : { brief: replay.brief }),
  ...(replay.frameCount ? { frameCount: replay.frameCount } : {}),
  ...(replay.seed !== undefined ? { seed: replay.seed } : {}),
})

/** What the player would do, step by step: each a request to the app. */
export function stepsOf(replay: Replay): { path: string; body?: unknown; what: string }[] {
  if (replay.kind === 'roleplay') {
    return [
      { path: 'roleplay/cast', what: 'the Cast' },
      { path: 'roleplay/begin', what: 'the opening' },
      ...(replay.messages ?? []).map((text, i) => ({
        path: 'roleplay/messages',
        body: { text },
        what: `Message ${i + 1}`,
      })),
    ]
  }
  if (replay.kind === 'chain') {
    return [
      { path: 'frames', body: {}, what: 'the Opening Frame' },
      ...(replay.actions ?? []).map((action, i) => ({
        path: 'frames',
        body: { action },
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

  for (const step of stepsOf(replay)) {
    const start = performance.now()
    await follow(await session(step.path, step.body))
    console.log(`${step.what}: ${((performance.now() - start) / 1000).toFixed(0)} s`)
  }

  if (replay.pictures !== false && args.pictures) {
    const { frames } = await (await api(`sessions/${id}`)).json()
    // A Roleplay's Art Agent writes each Image Prompt first; Chains and Storyboards have theirs.
    const kinds = replay.kind === 'roleplay' ? ['picture', 'render'] : ['render']
    for (const kind of kinds) {
      for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
        const queued = await session('jobs', { kind, frameIndex })
        if (!queued.ok) console.warn(`${kind} ${frameIndex}: ${(await queued.json()).error}`)
      }
      await jobsDone(api, id, kind)
    }
  }
  console.log(`Done: ${args.server.replace(/\/$/, '')} → Session ${id}`)
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
