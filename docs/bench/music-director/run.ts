/**
 * The Music Director's bench (README.md, docs/music-plans.md): the bench replays
 * (`server/replay/replays/music-*.yaml`), each over several seeds, their music directed under
 * variants and scored against each replay's course, a change a Frame either side counting as kept.
 *
 * Two steps, so every variant directs the same stories:
 *
 *   deno run -A docs/bench/music-director/run.ts play <seed>...
 *     plays each replay's Messages through the app's engine in a scratch folder (no pictures) and
 *     writes its Score, saving `stories/<replay>-<seed>.json`
 *   deno run -A docs/bench/music-director/run.ts direct <variant> <seed>...
 *     directs each story Frame by Frame with the app's `directFrame`, under `<variant>`
 *     (`VARIANTS`), saving `results/<variant>-<seed>.json` and printing a line per replay
 *   deno run -A docs/bench/music-director/run.ts table <variant>...
 *     sums the saved results, a row per variant and replay
 *
 * `ONLY=tavern-small-talk,…` runs only those replays; `AS=<name>` saves `direct`'s results under that name instead of the variant's, to compare a prompt's wordings. `stories/` and `results/` aren't committed: the README has what they showed.
 */
import { fileURLToPath } from 'node:url'
import { dirScenarioLibrary } from '../../../server/scenario.ts'
import { dirSessionStore } from '../../../server/session.ts'
import { DEFAULT_SETTINGS, fileSettingsStore, type Settings } from '../../../server/settings.ts'
import { chatRoleplayModel } from '../../../server/roleplay/model.ts'
import { textBackend } from '../../../server/text/backend.ts'
import { seededChat } from '../../../server/text/seeded.ts'
import type { Chat } from '../../../server/text/chat.ts'
import { placeholderImageGenerator } from '../../../server/images/imageGenerator.ts'
import { beginRoleplay, sendMessage, writeCast } from '../../../server/roleplay/engine.ts'
import { writeScore } from '../../../server/roleplay/score.ts'
import { directFrame, type DirectorReads } from '../../../server/roleplay/director.ts'
import { type Chunking, scoreRoleplay } from '../../../server/roleplay/hindsight.ts'
import type { RoleplaySession } from '../../../server/roleplay/types.ts'
import {
  type CourseStep,
  keepsTo,
  parseReplay,
  type Replay,
  stepOf,
} from '../../../server/replay/replay.ts'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const ALL_REPLAYS = [
  'music-tavern-small-talk',
  'music-tavern-lost-daughter',
  'music-tavern-hired-killer',
  'music-heavens-door',
  'music-buffet-of-souls',
]
/** Every replay, or only those named in `ONLY` (comma-separated), for a quick try. */
const REPLAYS = Deno.env.get('ONLY')?.split(',').map((n) => `music-${n}`) ?? ALL_REPLAYS

/**
 * A variant: what the Director reads, and the music settings it changes for some replays; or, with
 * `hindsight`, Score the Roleplay's pass over the whole story, chunked as it says.
 */
interface Variant {
  reads: DirectorReads
  hindsight?: Chunking
  /** Per replay, what's changed from its own music; a replay not listed is left out. */
  only?: Record<string, Partial<Pick<Settings, 'musicBehaviour' | 'musicVocals'>>>
}
const VARIANTS: Record<string, Variant> = {
  /** Each replay as written: its own Behaviour and Vocals, the whole story. */
  base: { reads: 'whole' },
  /** The same, reading only the Frames since the Cue playing began. */
  since: { reads: 'since' },
  /** The Buffet played Follows the story, against its Steady. */
  'buffet-story': { reads: 'whole', only: { 'music-buffet-of-souls': { musicBehaviour: 'story' } } },
  /** Heaven with Instrumental only, against its wordless voices. */
  'heaven-instrumental': {
    reads: 'whole',
    only: { 'music-heavens-door': { musicVocals: 'instrumental' } },
  },
  /** Score the Roleplay, with hindsight: each story in one call, as the app reads 15 Frames. */
  hindsight: { reads: 'whole', hindsight: { frames: 30, around: 6 } },
  /** The whole story in one call, however long: against `hindsight`'s 30-Frame chunks on a long one. */
  'hindsight-whole': { reads: 'whole', hindsight: { frames: 10_000, around: 0 } },
  /** The same in chunks of 5 Frames, 2 more read either side: how the chunks join. */
  'hindsight-chunked': { reads: 'whole', hindsight: { frames: 5, around: 2 } },
  /** The control played Cinematic: how much more it changes. */
  'control-cinematic': {
    reads: 'whole',
    only: { 'music-tavern-small-talk': { musicBehaviour: 'cinematic' } },
  },
}

const settings = await fileSettingsStore(here('../../../settings.json')).load()
const scenarios = dirScenarioLibrary(here('../../../example-scenarios/'))
const replayOf = async (name: string) =>
  parseReplay(await Deno.readTextFile(here(`../../../server/replay/replays/${name}.yaml`)))

/** Replies that ended in whitespace: a runaway under the schema (AGENTS.md). */
let runaways = 0
/** A chat that counts runaways and times each call by its job. */
function watched(chat: Chat, times: Record<string, number[]>): Chat {
  return {
    get model() {
      return chat.model
    },
    get thinks() {
      return chat.thinks
    },
    async stream(call) {
      const start = performance.now()
      const result = await chat.stream(call)
      ;(times[call.job ?? 'other'] ??= []).push((performance.now() - start) / 1000)
      if (/\s{20,}$/.test(result.content)) {
        runaways++
        console.warn(`runaway in ${call.job}`)
      }
      return result
    },
  }
}

const chatFor = (id: string, seed: number, times: Record<string, number[]> = {}) =>
  watched(
    seededChat(
      textBackend({ backend: 'ollama', baseUrl: '' }, () => Promise.resolve(''))
        .chat(settings.textModel, false),
      { session: id, seed },
    ),
    times,
  )

const signal = () => AbortSignal.timeout(300_000)
const quiet = () => {}

/** Plays a replay's Messages at `seed`, and writes its Score, as its own music settings say. */
async function play(name: string, seed: number): Promise<RoleplaySession> {
  const replay = await replayOf(name)
  const scenario = (await scenarios.get(replay.scenario!))!
  const root = await Deno.makeTempDir({ prefix: 'music-bench-' })
  try {
    const store = dirSessionStore(root)
    const id = `${name}-${seed}`
    const model = chatRoleplayModel(chatFor(id, seed))
    const deps = { store, roleplayModel: model, imageGenerator: placeholderImageGenerator() }
    let session: RoleplaySession = {
      id,
      kind: 'roleplay',
      brief: null,
      scenarioId: scenario.id,
      scenario,
      settings: {
        ...DEFAULT_SETTINGS,
        ...settings,
        musicBehaviour: (replay.music?.behaviour ?? 'story') as Settings['musicBehaviour'],
        musicVocals: (replay.music?.vocals ?? 'instrumental') as Settings['musicVocals'],
        musicTaste: replay.music?.taste ?? '',
      },
      seed,
      createdAt: new Date().toISOString(),
      cast: null,
      frames: [],
    }
    await store.save(session)
    session = await writeCast(deps, session, scenario, quiet, signal())
    session = await beginRoleplay(deps, session, quiet, signal())
    for (const message of replay.messages ?? []) {
      session = (await sendMessage(deps, session, message, quiet, signal())) ?? session
    }
    return await writeScore({ store, model }, session, scenario, quiet, signal())
  } finally {
    await Deno.remove(root, { recursive: true })
  }
}

/** How a run kept to its course, a change a Frame either side counting as kept. */
interface Score {
  frames: number
  kept: number
  /** Changes the course has that weren't made within a Frame of it. */
  missed: number
  /** Changes made where the course holds, not a neighbour's change come early or late. */
  extra: number
  /** Changes kept, but entering the other way (gentle for sharp, or sharp for gentle). */
  wrongEntry: number
  sharp: number
  /** Cues of music (not silences) and the Frames each lasted, on average. */
  cues: number
  /** Cues with voices (wordless or choir). */
  voiced: number
  /** Stingers placed (Score the Roleplay only). */
  stingers: number
}

const CHANGES = ['gentle', 'sharp', 'change', 'silence'] as const

/** Scores a run's decisions (`stepOf`) against its course, Frame by Frame. */
export function scoreRun(course: CourseStep[], decided: string[]): Score {
  const used = new Set<number>()
  let kept = 0, missed = 0, extra = 0, wrongEntry = 0
  for (const [i, { step }] of course.entries()) {
    if (!(CHANGES as readonly string[]).includes(step)) continue
    const kind = (d: string) => (step === 'silence' ? d === 'silence' : d === 'gentle' || d === 'sharp')
    const j = [i, i - 1, i + 1].find((j) =>
      j >= 0 && j < decided.length && !used.has(j) && kind(decided[j]) &&
      (j === i || !(CHANGES as readonly string[]).includes(course[j].step))
    )
    if (j === undefined) {
      missed++
      continue
    }
    used.add(j)
    kept++
    if ((step === 'gentle' || step === 'sharp') && decided[j] !== step) wrongEntry++
  }
  for (const [i, { step }] of course.entries()) {
    if ((CHANGES as readonly string[]).includes(step)) continue
    // A neighbour's change, come a Frame early or late, or what the course asks.
    if (used.has(i) || keepsTo(step, decided[i])) kept++
    else extra++
  }
  return {
    frames: course.length,
    kept,
    missed,
    extra,
    wrongEntry,
    sharp: decided.filter((d) => d === 'sharp').length,
    cues: 0,
    voiced: 0,
    stingers: 0,
  }
}

/** Directs a played story Frame by Frame under `variant`, and scores it. */
async function direct(name: string, seed: number, variant: Variant) {
  const replay: Replay = await replayOf(name)
  const story = JSON.parse(await Deno.readTextFile(here(`./stories/${name}-${seed}.json`)))
  const scenario = (await scenarios.get(replay.scenario!))!
  const root = await Deno.makeTempDir({ prefix: 'music-bench-' })
  const times: Record<string, number[]> = {}
  try {
    const store = dirSessionStore(root)
    let session: RoleplaySession = {
      ...story,
      settings: { ...story.settings, ...variant.only?.[name] },
      cues: [],
      frames: story.frames.map((f: RoleplaySession['frames'][number]) => {
        const { music: _, ...rest } = f
        return rest
      }),
    }
    await store.save(session)
    const model = chatRoleplayModel(chatFor(`${session.id}-direct`, seed, times))
    if (variant.hindsight) {
      session = await scoreRoleplay(
        { store, model, chunking: variant.hindsight },
        session,
        scenario,
        quiet,
        signal(),
      )
    } else for (const f of session.frames) {
      session = await directFrame(
        { store, model, reads: variant.reads },
        session,
        scenario,
        f.index,
        quiet,
        signal(),
      )
    }
    const decided = session.frames.map((f) => stepOf(f.music!))
    const cues = session.cues ?? []
    const score = {
      ...scoreRun(replay.course!, decided),
      cues: cues.filter((c) => c.values).length,
      stingers: session.frames.filter((f) => f.music?.stinger).length,
      voiced: cues.filter((c) => c.values && c.values.vocals !== 'none').length,
    }
    const perFrame = [...times.director ?? [], ...times.hindsight ?? [], ...times.cue ?? []]
      .reduce((a, b) => a + b, 0) /
      session.frames.length
    return {
      name,
      seed,
      score,
      decided,
      secondsPerFrame: perFrame,
      frames: session.frames.map((f) => ({
        index: f.index,
        ...f.music,
        cue: cues.find((c) => c.id === f.music!.cue)?.values ?? null,
      })),
    }
  } finally {
    await Deno.remove(root, { recursive: true })
  }
}

type Result = Awaited<ReturnType<typeof direct>>

function summary(results: Result[]) {
  const sum = (k: keyof Score) => results.reduce((n, r) => n + r.score[k], 0)
  const frames = sum('frames')
  return {
    runs: results.length,
    kept: `${sum('kept')}/${frames} (${Math.round((100 * sum('kept')) / frames)}%)`,
    missed: sum('missed'),
    extra: sum('extra'),
    wrongEntry: sum('wrongEntry'),
    sharp: sum('sharp'),
    cues: sum('cues'),
    voiced: sum('voiced'),
    stingers: sum('stingers'),
    sPerFrame: (results.reduce((n, r) => n + r.secondsPerFrame, 0) / results.length).toFixed(1),
  }
}

if (import.meta.main) {
  const [command, ...rest] = Deno.args
  if (command === 'play') {
    await Deno.mkdir(here('./stories/'), { recursive: true })
    for (const seed of rest.map(Number)) {
      for (const name of REPLAYS) {
        const start = performance.now()
        const session = await play(name, seed)
        await Deno.writeTextFile(here(`./stories/${name}-${seed}.json`), JSON.stringify(session))
        console.log(`${name} seed ${seed}: ${((performance.now() - start) / 1000).toFixed(0)} s`)
      }
    }
  } else if (command === 'direct') {
    const [variantName, ...seeds] = rest
    const variant = VARIANTS[variantName]
    if (!variant) throw new Error(`A variant is one of ${Object.keys(VARIANTS).join(', ')}`)
    await Deno.mkdir(here('./results/'), { recursive: true })
    for (const seed of seeds.map(Number)) {
      const results: Result[] = []
      for (const name of REPLAYS.filter((n) => !variant.only || n in variant.only)) {
        const result = await direct(name, seed, variant)
        results.push(result)
        console.log(`${variantName} ${name} seed ${seed}:`, JSON.stringify(summary([result])))
      }
      await Deno.writeTextFile(
        here(`./results/${Deno.env.get('AS') ?? variantName}-${seed}.json`),
        JSON.stringify(results, null, 1),
      )
    }
    console.log(`runaways: ${runaways}`)
  } else if (command === 'table') {
    const rows: string[] = []
    for (const variantName of rest) {
      const results: Result[] = []
      for await (const entry of Deno.readDir(here('./results/'))) {
        if (new RegExp(`^${variantName}-\\d+\\.json$`).test(entry.name)) {
          results.push(...JSON.parse(await Deno.readTextFile(here(`./results/${entry.name}`))))
        }
      }
      for (const name of [...new Set(results.map((r) => r.name))]) {
        const s = summary(results.filter((r) => r.name === name))
        rows.push(
          `| ${variantName} | ${name.replace('music-', '')} | ${s.runs} | ${s.kept} | ${s.missed} | ${s.extra} | ${s.wrongEntry} | ${s.sharp} | ${s.cues} | ${s.voiced} | ${s.stingers || 0} | ${s.sPerFrame} |`,
        )
      }
    }
    console.log(
      '| Variant | Replay | Runs | Kept | Missed | Extra | Wrong entry | Sharp | Cues | Voiced | Stingers | s/Frame |',
    )
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
    console.log(rows.join('\n'))
  } else {
    console.error('Usage: run.ts play <seed>... | direct <variant> <seed>... | table <variant>...')
    Deno.exit(1)
  }
}
