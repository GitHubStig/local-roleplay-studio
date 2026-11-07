/**
 * Score the Roleplay (docs/music-plans.md): the pass with hindsight, like a film's spotting session.
 * It reads the story in chunks, each placing the turns on its own Frames (a change, a silence or a
 * stinger) while reading a few Frames either side, then has the cue writer write each change's Cue,
 * and replaces every Cue and every Frame's music with what it found. Its prompts are
 * `prompts/roleplay/hindsight*.md`; the cue writer's are the Director's (`director.ts`).
 */
import { frameName, secondsSince, withRetry } from '../frames.ts'
import { loadPrompt } from '../promptFiles.ts'
import type { Scenario } from '../scenario.ts'
import type { ChatMessage } from '../text/chat.ts'
import {
  behaviourOf,
  cueStart,
  cueText,
  type DirectorDeps,
  musicStory,
  newCueId,
  scoreText,
  text,
  unquoted,
  withoutSpeaker,
  writeCueAt,
} from './director.ts'
import type { RoleplayEvent } from './engine.ts'
import { writeScore } from './score.ts'
import { type Cue, ENTRIES, type Entry, type FrameMusic, type RoleplaySession } from './types.ts'
import { GoneError, updateSession } from './update.ts'

/** What the pass can mark on a Frame; the music continues through every Frame it doesn't. */
export const TURNS = ['transition', 'silence', 'stinger'] as const
export type TurnDecision = (typeof TURNS)[number]

/** The pass's reply for a chunk of the story, each turn in the order it's written. */
export const hindsightSchema = {
  type: 'object',
  properties: {
    course: { type: 'string' },
    turns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          frame: { type: 'integer' },
          reading: { type: 'string' },
          decision: { type: 'string', enum: [...TURNS] },
          entry: { type: 'string', enum: [...ENTRIES] },
          line: { type: 'string' },
        },
        required: ['frame', 'reading', 'decision', 'entry', 'line'],
      },
    },
  },
  required: ['course', 'turns'],
}

/** A turn the pass marked, on Frame `index` (from 0). */
export interface Turn {
  index: number
  reading: string
  decision: TurnDecision
  entry: Entry
  line: string
}

/**
 * A chunk's list of turns, tidied: those on Frames `first` to `last` (from 0), in order, one a
 * Frame (a change over a stinger, else the first). A turn off those Frames, or without a reading,
 * is dropped rather than failing the chunk; a reply with no list throws.
 */
export function cleanTurns(
  value: unknown,
  first: number,
  last: number,
  session: RoleplaySession,
): Turn[] {
  if (!Array.isArray(value)) throw new Error('Score the Roleplay gave no list of turns')
  const byFrame = new Map<number, Turn>()
  for (const t of value as Record<string, unknown>[]) {
    const index = Number(t?.frame) - 1
    const reading = text(t?.reading)
    const decision = t?.decision as TurnDecision
    const entry = t?.entry as Entry
    if (!Number.isInteger(index) || index < first || index > last || !reading) continue
    if (!TURNS.includes(decision) || !ENTRIES.includes(entry)) continue
    const had = byFrame.get(index)
    if (had && !(had.decision === 'stinger' && decision !== 'stinger')) continue
    byFrame.set(index, {
      index,
      reading,
      decision,
      entry,
      line: withoutSpeaker(unquoted(t.line), session),
    })
  }
  return [...byFrame.values()].sort((a, b) => a.index - b.index)
}

/** A chunk of the story: the Frames it scores, and those it reads (a few more either side). */
export interface Chunk {
  first: number
  last: number
  readFrom: number
  readTo: number
}

/** How many Frames a chunk scores, and how many more it reads either side. */
export interface Chunking {
  frames: number
  around: number
}

/**
 * The whole story in one call up to 100 Frames (about 30k tokens, README), and 10 more read either
 * side beyond that. A 61-Frame story kept to its course better read whole than in chunks of 30,
 * and chunks of 5 changed far more (docs/bench/music-director/README.md, 2026-11-07).
 */
export const CHUNKING: Chunking = { frames: 100, around: 10 }

/** The chunks a story of `count` Frames is read in, one after another. */
export function chunksOf(count: number, { frames, around }: Chunking = CHUNKING): Chunk[] {
  const chunks: Chunk[] = []
  for (let first = 0; first < count; first += frames) {
    const last = Math.min(first + frames, count) - 1
    chunks.push({
      first,
      last,
      readFrom: Math.max(0, first - around),
      readTo: Math.min(count - 1, last + around),
    })
  }
  return chunks
}

/** The call that marks the turns of `chunk`, under the Cue playing as it begins. */
export async function hindsightMessages(
  session: RoleplaySession,
  chunk: Chunk,
  playing: Cue | undefined,
): Promise<ChatMessage[]> {
  const around = chunk.readFrom < chunk.first || chunk.readTo > chunk.last
  return [
    {
      role: 'system',
      content: await loadPrompt('roleplay/hindsight', { behaviour: await behaviourOf(session) }),
    },
    {
      role: 'user',
      content: await loadPrompt('roleplay/hindsight-request', {
        score: scoreText(session),
        story: musicStory(session, chunk.readTo, chunk.readFrom),
        playing: playing
          ? await loadPrompt('roleplay/director-playing', {
            cue: cueText(playing),
            reading: playing.reading,
          })
          : await loadPrompt('roleplay/hindsight-first'),
        around: around ? ` ${await loadPrompt('roleplay/hindsight-around')}` : '',
        first: chunk.first + 1,
        last: chunk.last + 1,
      }),
    },
  ]
}

export interface HindsightDeps extends DirectorDeps {
  /** How the story is chunked; `CHUNKING` unless a test or the bench says otherwise. */
  chunking?: Chunking
}

/**
 * Scores the whole Roleplay with hindsight: writes the Score first if there's none, marks each
 * chunk's turns, writes a Cue for each change, and replaces every Cue and the music of every Frame
 * it read. Frames that arrive while it runs keep what they were directed, under the last Cue it
 * found if theirs is gone. A silence plays until its first change.
 */
export async function scoreRoleplay(
  deps: HindsightDeps,
  session: RoleplaySession,
  scenario: Scenario,
  emit: (event: RoleplayEvent) => void,
  signal: AbortSignal,
): Promise<RoleplaySession> {
  if (!session.cast || !session.frames.length) throw new GoneError('The scene has not begun yet')
  let current = session
  if (!current.score) current = await writeScore(deps, current, scenario, emit, signal)
  const count = current.frames.length
  const started = performance.now()
  const chunks = chunksOf(count, deps.chunking)
  const cues: Cue[] = []
  const stingers = new Map<number, { reading: string; line: string }>()
  /** Seconds the cue writer took for the Cue each Frame began. */
  const cueSeconds = new Map<number, number>()
  /** How each chunk heard the course between them, written before its turns. */
  const courses: string[] = []

  for (const [n, chunk] of chunks.entries()) {
    emit({ type: 'phase', phase: 'text' })
    const { course, turns } = await withRetry(
      async (onThinking) => {
        const reply = await deps.model.scoreStory(
          await hindsightMessages(current, chunk, cues.at(-1)),
          signal,
          onThinking,
        )
        return {
          course: text(reply.course),
          turns: cleanTurns(reply.turns, chunk.first, chunk.last, current),
        }
      },
      signal,
      emit,
    )
    courses.push(course)
    if (n === 0 && !turns.some((t) => t.index === 0 && t.decision !== 'stinger')) {
      cues.push({ id: newCueId(), start: 0, entry: 'gentle', reading: '', line: '' })
    }
    for (const turn of turns) {
      const playing = cues.at(-1)
      if (turn.decision === 'stinger') {
        stingers.set(turn.index, { reading: turn.reading, line: turn.line })
      } else if (turn.decision === 'silence') {
        if (playing?.values) cues.push({ id: newCueId(), start: turn.index, ...cueStart(turn) })
      } else {
        const start = performance.now()
        const direction = { ...turn, decision: 'transition' as const }
        const values = await writeCueAt(deps, current, turn.index, playing, direction, emit, signal)
        cueSeconds.set(turn.index, secondsSince(start))
        cues.push({ id: newCueId(), start: turn.index, values, ...cueStart(turn) })
      }
    }
  }
  signal.throwIfAborted()

  const musicAt = (index: number): FrameMusic => {
    const cue = cues.findLast((c) => c.start <= index)!
    const begins = cue.start === index
    const stinger = stingers.get(index)
    return {
      cue: cue.id,
      reading: begins ? cue.reading : '',
      decision: begins ? (cue.values ? 'transition' : 'silence') : 'continue',
      entry: begins ? cue.entry : 'gentle',
      line: begins ? cue.line : '',
      model: deps.model.name,
      timings: { text: cueSeconds.get(index) ?? 0 },
      hindsight: true,
      ...(stinger && { stinger }),
    }
  }
  const updated = await updateSession(deps.store, session.id, (latest) => {
    if (!latest.frames.length) throw new GoneError(`${frameName(0)} no longer exists`)
    // Cues directed on Frames after those read, while the pass ran, stay; those on Frames undone
    // meanwhile go.
    const later = (latest.cues ?? []).filter((c) => c.start >= count)
    const all = [...cues, ...later].filter((c) => c.start < latest.frames.length)
    const ids = new Set(all.map((c) => c.id))
    const last = cues.findLast((c) => ids.has(c.id))!.id
    return {
      ...latest,
      cues: all,
      hindsight: {
        model: deps.model.name,
        chunks: chunks.length,
        courses,
        timings: { text: secondsSince(started) },
      },
      frames: latest.frames.map((f) =>
        f.index < count
          ? { ...f, music: musicAt(f.index) }
          : f.music && !ids.has(f.music.cue)
          ? { ...f, music: { ...f.music, cue: last } }
          : f
      ),
    }
  })
  emit({ type: 'scored', session: updated })
  return updated
}
