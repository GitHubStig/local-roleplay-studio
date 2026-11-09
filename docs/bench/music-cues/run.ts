/**
 * The cue writer's bench (see README.md): does it write captions ACE-Step renders well, and does its
 * reply end? From the Music Director's saved stories and readings (docs/bench/music-director, its
 * `stories/` and `results/`, which its run.ts makes), the Text Model writes each change's Cue straight
 * through `writeCue`, so a runaway isn't hidden by a retry.
 *
 *   deno run -A docs/bench/music-cues/run.ts write <label> <seed>...
 *     writes every change's Cue of each replay in the Director's run at that seed, into
 *     `out/<label>.jsonl`, saying which replies failed, and how long each took
 *   deno run -A docs/bench/music-cues/run.ts render <label> <comfyui address> <index>...
 *     renders those lines of it (or the first of each replay if none) into `out/<label>/`
 */
import { join } from 'node:path'
import { comfyuiMusicGenerator } from '../../../server/music/comfyui/comfyui.ts'
import { bpmOf, CUE_SECONDS, cleanCue, cueMessages, cueSchema, withDanger } from '../../../server/roleplay/director.ts'
import { chatRoleplayModel } from '../../../server/roleplay/model.ts'
import type { Cue, RoleplaySession } from '../../../server/roleplay/types.ts'
import { textBackend } from '../../../server/text/backend.ts'
import { seededChat } from '../../../server/text/seeded.ts'

const HERE = new URL('.', import.meta.url).pathname
const DIRECTOR = join(HERE, '../music-director')
const MODEL = Deno.env.get('MODEL') ?? 'gemma-4-26b-heretic:nvfp4'
const OUT = join(HERE, 'out')

interface Direct {
  name: string
  frames: {
    index: number
    decision: string
    entry: 'gentle' | 'sharp'
    reading: string
    line: string
  }[]
}

const readJson = async <T>(path: string) => JSON.parse(await Deno.readTextFile(path)) as T

async function write(label: string, seeds: number[]) {
  await Deno.mkdir(OUT, { recursive: true })
  const file = join(OUT, `${label}.jsonl`)
  await Deno.writeTextFile(file, '')
  let calls = 0
  let failed = 0
  const seconds: number[] = []
  for (const seed of seeds) {
    for (const run of await readJson<Direct[]>(join(DIRECTOR, 'results', `base-${seed}.json`))) {
      const story = await readJson<RoleplaySession>(
        join(DIRECTOR, 'stories', `${run.name}-${seed}.json`),
      )
      const session = { ...story, cues: [] as Cue[] }
      const chat = seededChat(
        textBackend({ backend: 'ollama', baseUrl: '' }, () => Promise.resolve(''))
          .chat(MODEL, false),
        { session: `${run.name}-${seed}`, seed },
      )
      const model = chatRoleplayModel(chat)
      let previous: Cue | undefined
      for (const frame of run.frames.filter((f) => f.decision === 'transition')) {
        calls++
        const direction = { ...frame, decision: 'transition' as const }
        const start = performance.now()
        try {
          const messages = await cueMessages(session, frame.index, previous, direction)
          const { values } = await model.writeCue(
            messages,
            cueSchema(frame.entry),
            AbortSignal.timeout(180_000),
          )
          const cue = await withDanger(cleanCue(values))
          const took = (performance.now() - start) / 1000
          seconds.push(took)
          previous = { id: `cue-${frame.index}`, start: frame.index, values: cue, entry: frame.entry, reading: frame.reading, line: frame.line }
          const row = {
            replay: run.name,
            seed,
            frame: frame.index,
            took: Math.round(took * 10) / 10,
            words: cue.caption.split(/\s+/).length,
            bpm: bpmOf(cue.tempo, session.score!.tempo),
            reading: frame.reading,
            ...cue,
          }
          await Deno.writeTextFile(file, JSON.stringify(row) + '\n', { append: true })
          console.log(`${run.name}-${seed} F${frame.index} ${row.took}s ${row.words}w ${cue.key} ${row.bpm}`)
        } catch (err) {
          failed++
          const took = (performance.now() - start) / 1000
          console.log(`${run.name}-${seed} F${frame.index} FAILED after ${took.toFixed(1)}s: ${(err as Error).message.slice(0, 200)}`)
        }
      }
    }
  }
  seconds.sort((a, b) => a - b)
  console.log(`${calls} calls, ${failed} failed; median ${seconds[seconds.length >> 1]?.toFixed(1)} s, longest ${seconds.at(-1)?.toFixed(1)} s`)
}

async function render(label: string, address: string, indexes: number[]) {
  const rows = (await Deno.readTextFile(join(OUT, `${label}.jsonl`))).trim().split('\n').map((l) => JSON.parse(l))
  const seen = new Set<string>()
  const picked = indexes.length
    ? indexes.map((i) => [i, rows[i]] as const)
    : rows.map((r, i) => [i, r] as const).filter(([, r]) => !seen.has(r.replay) && seen.add(r.replay))
  const dir = join(OUT, label)
  await Deno.mkdir(dir, { recursive: true })
  const takes = Deno.env.get('SEEDS')?.split(',').map(Number)
  for (const [i, row] of picked.flatMap(([i, r]) => (takes ?? [r.seed]).map((seed) => [i, { ...r, seed }] as const))) {
    const start = performance.now()
    const name = await comfyuiMusicGenerator({ address }).makeMusic(
      {
        caption: row.caption,
        lyrics: row.lyrics,
        seconds: CUE_SECONDS,
        bpm: row.bpm,
        key: row.key,
        seed: row.seed,
        dir,
        name: `${i}-${row.replay.replace('music-', '')}-f${row.frame}-s${row.seed}`,
      },
      AbortSignal.timeout(600_000),
    )
    console.log(`${name} ${((performance.now() - start) / 1000).toFixed(1)} s`)
  }
}

const [command, label, ...rest] = Deno.args
if (command === 'write') await write(label, rest.map(Number))
else if (command === 'render') await render(label, rest[0], rest.slice(1).map(Number))
else throw new Error('write or render')
