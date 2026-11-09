/**
 * The Music Director (docs/music-plans.md): after a Reply, it reads the whole story, the Cue
 * playing and why it began, and decides whether the ground between the people has shifted since:
 * the music continues, changes (a new Cue, gently or sharply), or falls silent. On a change, the
 * cue writer picks the new Cue's values within the Score. Its prompts are
 * `prompts/roleplay/director*.md` and `cue*.md`.
 */
import { frameName, secondsSince, withRetry } from '../frames.ts'
import { crossedLimit } from '../limits.ts'
import { loadPrompt } from '../promptFiles.ts'
import type { Scenario } from '../scenario.ts'
import type { MusicVocals } from '../settings.ts'
import type { SessionStore } from '../session.ts'
import type { ChatMessage } from '../text/chat.ts'
import type { RoleplayEvent } from './engine.ts'
import type { RoleplayModel } from './model.ts'
import { writeScore } from './score.ts'
import {
  type Cue,
  CUE_KEYS,
  CUE_SHAPES,
  CUE_VOCALS,
  type CueValues,
  type Decision,
  DECISIONS,
  DENSITIES,
  ENERGIES,
  ENTRIES,
  type Entry,
  type FrameMusic,
  type RoleplayFrame,
  type RoleplaySession,
  type Score,
  TEMPOS,
} from './types.ts'
import { GoneError, updateSession } from './update.ts'

/** The Director's reply, in the order it's written. */
export const directorSchema = {
  type: 'object',
  properties: {
    reading: { type: 'string' },
    decision: { type: 'string', enum: [...DECISIONS] },
    entry: { type: 'string', enum: [...ENTRIES] },
    line: { type: 'string' },
  },
  required: ['reading', 'decision', 'entry', 'line'],
}

/** The voices a Cue may have under the Vocals setting: none, or wordless ones and choirs. */
export const vocalsAllowed = (vocals: MusicVocals): readonly CueValues['vocals'][] =>
  vocals === 'instrumental' ? ['none'] : CUE_VOCALS

/** The cue writer's reply, in the order it's written; its vocals held by the Vocals setting. */
export const cueSchema = (vocals: MusicVocals, entry: Entry = 'sharp') => ({
  type: 'object',
  properties: {
    mood: { type: 'string' },
    energy: { type: 'string', enum: [...ENERGIES] },
    density: { type: 'string', enum: [...DENSITIES] },
    tempo: { type: 'string', enum: [...TEMPOS] },
    instruments: { type: 'array', items: { type: 'string' } },
    vocals: { type: 'string', enum: [...vocalsAllowed(vocals)] },
    // Only on a sharp change: asked in words, it also took a wary or a hollow moment for danger
    // (2026-11-09), and "sharp" is held to what breaks the scene.
    shape: { type: 'string', enum: CUE_SHAPES.filter((s) => s !== 'danger' || entry === 'sharp') },
    key: { type: 'string', enum: [...CUE_KEYS] },
    caption: { type: 'string' },
    lyrics: { type: 'string' },
  },
  required: [
    'mood',
    'energy',
    'density',
    'tempo',
    'instruments',
    'vocals',
    'shape',
    'key',
    'caption',
    'lyrics',
  ],
})

/** How long a Cue's track is, before it loops. */
export const CUE_SECONDS = 60

/**
 * A Cue's tempo in beats per minute: half or three quarters up the Score's range, or its fastest, and
 * a fast Cue at least 100. Scores set low ranges, and the Cues the owner liked ran at 60–70, and
 * tension at 100 or more (docs/bench/music-models/README.md, "Tension").
 */
export function bpmOf(tempo: CueValues['tempo'], range: Score['tempo']): number {
  const at = (up: number) => Math.round(range.slowest + (range.fastest - range.slowest) * up)
  return tempo === 'fast' ? Math.max(range.fastest, 100) : at(tempo === 'slow' ? 1 / 2 : 3 / 4)
}

/**
 * A caption that has its voices. Their lines to sing aren't enough on their own: in the bench's Cues
 * with voices, those whose captions didn't name them weren't heard (2026-11-09), and the Text Model
 * leaves them out of about half.
 */
const withVoices = (caption: string) =>
  !caption || /\b(choir|voices?)\b/i.test(caption)
    ? caption
    : `${caption} A low, soft wordless choir sings in the background throughout.`

/**
 * Lyrics with lines for voices to sing, as they're only heard with them, and the Text Model gave too
 * few to 3 of 7 Cues with voices (2026-11-09): with under three, the lines of the Heaven the owner
 * could hear them in go between its first section and its last.
 */
function withLines(lyrics: string) {
  const lines = lyrics.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.filter((line) => !line.startsWith('[')).length >= 3) return lyrics
  const tags = lines.filter((line) => line.startsWith('['))
  if (!tags.length) return lyrics
  return [
    tags[0],
    '[Choir - soft, wordless]\nOoh... ooh...\nAah... aah...',
    '[Choir - with warm strings, fuller, calm]\nOoh... aah...\nOoh... aah...',
    ...(tags.length > 1 ? [`${tags.at(-1)}\nAah...`] : []),
  ].join('\n\n')
}

/** Lyrics with no lines to sing: only their section tags, as anything else would be sung. */
const onlyTags = (lyrics: string) =>
  lyrics.split('\n').map((line) => line.trim()).filter((line) => /^\[.*\]$/.test(line)).join('\n\n')

/** What the Director decided, tidied. */
export interface Direction {
  reading: string
  decision: Decision
  entry: Entry
  line: string
}

export const text = (x: unknown) => (typeof x === 'string' ? x.trim() : '')
/** A line quoted word for word, its own quotation marks dropped. */
export const unquoted = (line: unknown) => text(line).replace(/^["“'‘]+|["”'’]+$/g, '').trim()
const oneOf = <T extends string>(x: unknown, all: readonly T[]): T => {
  if (!all.includes(x as T)) throw new Error(`Expected one of ${all.join(', ')}, got ${x}`)
  return x as T
}

/** The Director's reply, tidied; throws without a reading or with a decision it doesn't know. */
export function cleanDirection(value: unknown): Direction {
  const v = (value ?? {}) as Record<string, unknown>
  const reading = text(v.reading)
  if (!reading) throw new Error('The Director gave no reading')
  return {
    reading,
    decision: oneOf(v.decision, DECISIONS),
    entry: oneOf(v.entry, ENTRIES),
    line: unquoted(v.line),
  }
}

/** The cue writer's reply, tidied; throws without a mood, an instrument, a caption or lyrics. */
export function cleanCue(value: unknown, vocals: MusicVocals): CueValues {
  const v = (value ?? {}) as Record<string, unknown>
  const seen = new Set<string>()
  const instruments = (Array.isArray(v.instruments) ? v.instruments : [])
    .map(text)
    .filter((i) => i && !seen.has(i.toLowerCase()) && seen.add(i.toLowerCase()))
  const vocal = oneOf(v.vocals, vocalsAllowed(vocals))
  const lyrics = vocal === 'none' ? onlyTags(text(v.lyrics)) : withLines(text(v.lyrics))
  const caption = vocal === 'none' ? text(v.caption) : withVoices(text(v.caption))
  const values: CueValues = {
    // Without stray markup at its end ("fragile</", seen once on 2026-11-06).
    mood: text(v.mood).replace(/[\s<>/\\]+$/, ''),
    energy: oneOf(v.energy, ENERGIES),
    density: oneOf(v.density, DENSITIES),
    tempo: oneOf(v.tempo, TEMPOS),
    instruments,
    vocals: vocal,
    shape: oneOf(v.shape, CUE_SHAPES),
    key: oneOf(v.key, CUE_KEYS),
    caption,
    lyrics,
  }
  if (!values.mood) throw new Error('The Cue has no mood')
  if (!instruments.length) throw new Error('The Cue has no instruments')
  if (!values.caption) throw new Error('The Cue has no caption')
  if (!lyrics) throw new Error('The Cue has no lyrics')
  return values
}

/** The Cue playing just before Frame `index`: the latest to begin on an earlier Frame. */
export const cueBefore = (session: RoleplaySession, index: number): Cue | undefined =>
  (session.cues ?? []).findLast((c) => c.start < index)

/** The Cue Frame `index` plays under, if it's been directed. */
export const cueOf = (session: RoleplaySession, frame: RoleplayFrame): Cue | undefined =>
  frame.music ? session.cues?.find((c) => c.id === frame.music!.cue) : undefined

/**
 * The story from Frame `from` up to and including Frame `upTo`, as the Director reads it: each
 * Message, and what the Character thought, did and said. Thoughts are in: the music can hear what
 * isn't said.
 */
export function musicStory(session: RoleplaySession, upTo: number, from = 0): string {
  const character = session.cast?.character.name ?? 'The Character'
  const persona = session.cast?.persona.name ?? 'The player'
  return session.frames.slice(from, upTo + 1).map((f) => {
    const lines = [frameName(f.index)]
    if (f.message !== null) lines.push(`${persona}: ${f.message}`)
    if (f.reply.internal) lines.push(`${character} (thinks): ${f.reply.internal}`)
    const said = f.reply.dialogue ? ` "${f.reply.dialogue}"` : ''
    lines.push(`${character}: ${f.reply.actions}${said}`)
    return lines.join('\n')
  }).join('\n\n')
}

/** A Cue as the Director and the cue writer read it. */
export function cueText(cue: Cue): string {
  if (!cue.values) return `silence, since ${frameName(cue.start)}`
  const v = cue.values
  return [
    `since ${frameName(cue.start)}: ${v.mood}`,
    `energy ${v.energy}, density ${v.density}, tempo ${v.tempo}`,
    `instruments: ${v.instruments.join(', ')}`,
    `vocals: ${v.vocals}`,
  ].join('; ')
}

/** The Score as the Director and the cue writer read it. */
export const scoreText = (session: RoleplaySession) => {
  const s = session.score!
  return [
    `Genre: ${s.genre}`,
    `Instruments: ${s.palette.join(', ')}`,
    `Atmosphere: ${s.atmosphere}`,
    `Tempo: ${s.tempo.slowest} to ${s.tempo.fastest} beats per minute`,
    `Avoid: ${s.avoid.length ? s.avoid.join(', ') : 'nothing in particular'}`,
  ].join('\n')
}

export const behaviourOf = (session: RoleplaySession) =>
  loadPrompt(`roleplay/music-behaviour-${session.settings.musicBehaviour}`)

/**
 * What the Director reads: the whole story, or only the Frames since the Cue playing began (the
 * bench compares them, docs/music-plans.md).
 */
export type DirectorReads = 'whole' | 'since'

/** The call that directs the music at Frame `index`, under the Cue playing before it. */
export async function directorMessages(
  session: RoleplaySession,
  index: number,
  playing: Cue | undefined,
  reads: DirectorReads = 'whole',
): Promise<ChatMessage[]> {
  return [
    {
      role: 'system',
      content: await loadPrompt('roleplay/director', { behaviour: await behaviourOf(session) }),
    },
    {
      role: 'user',
      content: await loadPrompt('roleplay/director-request', {
        score: scoreText(session),
        story: musicStory(session, index, reads === 'since' ? playing?.start ?? 0 : 0),
        playing: playing
          ? await loadPrompt('roleplay/director-playing', {
            cue: cueText(playing),
            reading: playing.reading,
          })
          : await loadPrompt('roleplay/director-first'),
        frame: frameName(index),
      }),
    },
  ]
}

/** The call that writes the Cue a change at Frame `index` begins, from the Director's reading. */
export async function cueMessages(
  session: RoleplaySession,
  index: number,
  previous: Cue | undefined,
  direction: Direction,
): Promise<ChatMessage[]> {
  const vocals = session.settings.musicVocals
  return [
    {
      role: 'system',
      content: await loadPrompt('roleplay/cue', {
        behaviour: await behaviourOf(session),
        vocals: await loadPrompt(`roleplay/cue-vocals-${vocals}`),
        seconds: String(CUE_SECONDS),
      }),
    },
    {
      role: 'user',
      content: await loadPrompt('roleplay/cue-request', {
        score: scoreText(session),
        // Its values, not its caption: shown the caption, a third of the next ones read as changes
        // to it ("the organ falls away"), which the music model can't follow (2026-11-09).
        previous: previous ? cueText(previous) : 'none: this is the first music in the story',
        frame: frameName(index),
        reading: direction.reading,
        entry: direction.entry === 'sharp' ? 'a sharp turn, the music cut' : 'a gentle shift',
        line: direction.line || '(none quoted)',
      }),
    },
  ]
}

export interface DirectorDeps {
  store: SessionStore
  /** The Session's Text Model. */
  model: RoleplayModel
  /** What the Director reads; the whole story unless the bench says otherwise. */
  reads?: DirectorReads
}

/**
 * A Cue as it's made: one marked as danger takes the caption and lyrics the owner found good, fast and
 * in their key, with no voices, as no tension the Text Model wrote came near them (2026-11-09).
 */
export async function withDanger(values: CueValues): Promise<CueValues> {
  if (values.shape !== 'danger') return values
  return {
    ...values,
    tempo: 'fast',
    key: 'D minor',
    vocals: 'none',
    caption: (await loadPrompt('roleplay/cue-danger-caption')).trim(),
    lyrics: (await loadPrompt('roleplay/cue-danger-lyrics')).trim(),
  }
}

/** A short id for a new Cue. */
export const newCueId = () => `cue-${crypto.randomUUID().slice(0, 8)}`

/**
 * Directs the music at Frame `index`: writes the Score first if the Roleplay has none, asks the
 * Director, and on a change the cue writer, then saves the Frame's reading and decision and any Cue
 * it begins. Directing a Frame again replaces what it decided, and the Cue it began. With no music
 * yet, the first Frame directed begins some (a `continue` is read as a gentle change); a silence
 * during a silence continues it.
 */
export async function directFrame(
  deps: DirectorDeps,
  session: RoleplaySession,
  scenario: Scenario,
  index: number,
  emit: (event: RoleplayEvent) => void,
  signal: AbortSignal,
): Promise<RoleplaySession> {
  if (!session.cast || !session.frames[index]) {
    throw new GoneError(`There is no ${frameName(index)}`)
  }
  let current = session
  if (!current.score) current = await writeScore(deps, current, scenario, emit, signal)
  emit({ type: 'phase', phase: 'text' })
  const start = performance.now()
  const playing = cueBefore(current, index)
  const directed = await withRetry(
    async (onThinking) =>
      cleanDirection(
        (await deps.model.direct(
          await directorMessages(current, index, playing, deps.reads),
          signal,
          onThinking,
        )).direction,
      ),
    signal,
    emit,
  )
  let decision = directed.decision
  if (!playing && decision === 'continue') decision = 'transition'
  if (playing && !playing.values && decision === 'silence') decision = 'continue'
  const direction = { ...directed, decision, line: withoutSpeaker(directed.line, current) }

  let cue: Cue | undefined
  if (decision === 'transition') {
    const values = await writeCueAt(deps, current, index, playing, direction, emit, signal)
    cue = { id: newCueId(), start: index, values, ...cueStart(direction) }
  } else if (decision === 'silence') {
    cue = { id: newCueId(), start: index, ...cueStart(direction) }
  }
  signal.throwIfAborted()

  const music: FrameMusic = {
    cue: cue?.id ?? playing!.id,
    ...direction,
    line: decision === 'continue' ? '' : direction.line,
    model: deps.model.name,
    timings: { text: secondsSince(start) },
  }
  let frame!: RoleplayFrame
  const updated = await updateSession(deps.store, session.id, (latest) => {
    const now = latest.frames[index]
    if (!now) throw new GoneError(`${frameName(index)} no longer exists`)
    frame = { ...now, music }
    const kept = (latest.cues ?? []).filter((c) => c.start !== index)
    const cues = cue ? [...kept, cue].sort((a, b) => a.start - b.start) : kept
    // A Frame directed again under a Cue it no longer begins: those after it that played under
    // the old one now play under the one before.
    const gone = new Set((latest.cues ?? []).filter((c) => c.start === index).map((c) => c.id))
    return {
      ...latest,
      cues,
      frames: latest.frames.map((f) =>
        f.index === index
          ? frame
          : f.music && gone.has(f.music.cue)
          ? { ...f, music: { ...f.music, cue: music.cue } }
          : f
      ),
    }
  })
  emit({ type: 'directed', frame, session: updated })
  return updated
}

/**
 * The cue writer's values for the Cue a change at Frame `index` begins, after `previous`; throws if
 * they cross a Limit.
 */
export async function writeCueAt(
  deps: Pick<DirectorDeps, 'model'>,
  session: RoleplaySession,
  index: number,
  previous: Cue | undefined,
  direction: Direction,
  emit: (event: RoleplayEvent) => void,
  signal: AbortSignal,
): Promise<CueValues> {
  const vocals = session.settings.musicVocals
  const values = await withRetry(
    async (onThinking) =>
      await withDanger(cleanCue(
        (await deps.model.writeCue(
          await cueMessages(session, index, previous, direction),
          cueSchema(vocals, direction.entry),
          signal,
          onThinking,
        )).values,
        vocals,
      )),
    signal,
    emit,
  )
  const limit = crossedLimit(
    [values.mood, ...values.instruments, values.caption, values.lyrics].join('\n'),
  )
  if (limit) throw new Error(`The Cue crossed a limit: ${limit.message}`)
  return values
}

/**
 * A quoted line without the name the story puts before it ("Elara: I'm looking…"), as the Director
 * sometimes copies it with the line (seen 2026-11-06 on the tavern).
 */
export function withoutSpeaker(line: string, session: RoleplaySession): string {
  const names = [session.cast?.character.name, session.cast?.persona.name].filter(Boolean)
  const said = names.map((n) => `${n}: `).find((p) => line.startsWith(p))
  if (!said) return line
  const rest = line.slice(said.length).trim()
  // Its closing quotation mark may be gone already (`unquoted`).
  return rest.match(/^["“]([^"“”]*)["”]?$/)?.[1].trim() ?? rest
}

/** What a Cue keeps of the direction that began it. */
export const cueStart = (d: Pick<Direction, 'entry' | 'reading' | 'line'>) => ({
  entry: d.entry,
  reading: d.reading,
  line: d.line,
})

/** A Roleplay without the Cues that began on Frame `index`, as after it's undone. */
export const withoutCuesFrom = (session: RoleplaySession, index: number): RoleplaySession =>
  session.cues?.some((c) => c.start >= index)
    ? { ...session, cues: session.cues.filter((c) => c.start < index) }
    : session
