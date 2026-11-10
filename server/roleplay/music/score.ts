/**
 * A Roleplay's Score: its music's identity, written once like the Look and shared by every Cue
 * (docs/design.md). Written from the Cast, the Brief, the Scenario's Music and the Session's
 * Music taste; edited by hand in the Music tab. Its prompts are `prompts/roleplay/music/score*.md`.
 */
import { secondsSince, withRetry } from '../../frames.ts'
import { crossedLimit } from '../../limits.ts'
import { loadPrompt } from '../../promptFiles.ts'
import type { Scenario } from '../../../shared/scenario.ts'
import { MUSIC_BEHAVIOURS, type MusicBehaviour } from '../../../shared/settings.ts'
import type { SessionStore } from '../../session.ts'
import type { ChatMessage } from '../../text/chat.ts'
import type { RoleplayEvent } from '../../../shared/events.ts'
import type { RoleplayModel } from '../model.ts'
import type { RoleplaySession, Score } from '../../../shared/roleplay.ts'
import { updateSession } from '../update.ts'
import { Refusal } from '../../refusal.ts'

/** The tempo range a Score may set, in beats per minute. */
export const TEMPO = { slowest: 40, fastest: 200 }
/** At most this many instruments in a palette, and phrases to avoid. */
const MAX_PALETTE = 8
const MAX_AVOID = 12

/**
 * The Score's reply, in the order it's written. No bounds in the schema (the tempo's, the
 * palette's length): they're asked for in words and held by `cleanScore`.
 */
export const scoreSchema = {
  type: 'object',
  properties: {
    genre: { type: 'string' },
    palette: { type: 'array', items: { type: 'string' } },
    atmosphere: { type: 'string' },
    tempo: {
      type: 'object',
      properties: { slowest: { type: 'integer' }, fastest: { type: 'integer' } },
      required: ['slowest', 'fastest'],
    },
    avoid: { type: 'array', items: { type: 'string' } },
  },
  required: ['genre', 'palette', 'atmosphere', 'tempo', 'avoid'],
}

/** A Score, or the music settings, can't be saved as given. */
export class ScoreError extends Refusal {
  static override status = 400
}
/** A hand-edited Score crosses a Limit. */
export class ScoreLimitError extends Refusal {
  static override status = 422
}

/** Phrases tidied: trimmed, blanks and repeats (in any case) dropped, at most `max`. */
const phrases = (value: unknown, max: number): string[] => {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().replace(/\.$/, ''))
    .filter((v) => v && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()))
    .slice(0, max)
}

const bpm = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(TEMPO.fastest, Math.max(TEMPO.slowest, Math.round(value)))
    : fallback

/**
 * A Score written or edited, tidied: its text trimmed, its lists without blanks or repeats, its
 * tempo within `TEMPO`, the slowest first. Throws a `ScoreError` without a genre, a palette or an
 * atmosphere.
 */
export function cleanScore(value: unknown): Score {
  const v = (value ?? {}) as Record<string, unknown>
  const text = (x: unknown) => (typeof x === 'string' ? x.trim() : '')
  const tempo = (v.tempo ?? {}) as Record<string, unknown>
  const [slowest, fastest] = [bpm(tempo.slowest, 60), bpm(tempo.fastest, 120)].sort((a, b) => a - b)
  const score: Score = {
    genre: text(v.genre),
    palette: phrases(v.palette, MAX_PALETTE),
    // A sentence, though the model sometimes starts it in lower case.
    atmosphere: text(v.atmosphere).replace(/^\p{Ll}/u, (c) => c.toUpperCase()),
    tempo: { slowest, fastest },
    avoid: phrases(v.avoid, MAX_AVOID),
  }
  if (!score.genre) throw new ScoreError('The Score needs a genre')
  if (!score.palette.length) throw new ScoreError('The Score needs at least one instrument')
  if (!score.atmosphere) throw new ScoreError('The Score needs an atmosphere')
  return score
}

/** The Score's text, as the Limits check it. */
const scoreText = (s: Score) => [s.genre, ...s.palette, s.atmosphere, ...s.avoid].join('\n')

/** The call that writes a Roleplay's Score. */
export async function scoreMessages(
  session: RoleplaySession,
  scenario: Scenario,
  taste: string,
): Promise<ChatMessage[]> {
  const music = scenario.music.trim()
  return [
    {
      role: 'system',
      content: await loadPrompt('roleplay/music/score', TEMPO),
    },
    {
      role: 'user',
      content: await loadPrompt('roleplay/music/score-request', {
        brief: scenario.opening,
        cast: session.cast!,
        music: music
          ? await loadPrompt('roleplay/music/score-music', { music })
          : 'The story says nothing of its music: pick what fits it.',
        taste: taste.trim()
          ? await loadPrompt('roleplay/music/score-taste', { taste: taste.trim() })
          : '',
      }),
    },
  ]
}

export interface ScoreDeps {
  store: SessionStore
  /** The Session's Text Model. */
  model: RoleplayModel
}

/** Writes the Roleplay's Score, or writes it again, and saves it; refused if it crosses a Limit. */
export async function writeScore(
  deps: ScoreDeps,
  session: RoleplaySession,
  scenario: Scenario,
  emit: (event: RoleplayEvent) => void,
  signal: AbortSignal,
): Promise<RoleplaySession> {
  if (!session.cast) throw new ScoreError('This Roleplay has no Cast yet')
  emit({ type: 'phase', phase: 'text' })
  const start = performance.now()
  const messages = await scoreMessages(session, scenario, session.settings.musicTaste)
  const { score, thinking } = await withRetry(
    (onThinking) => deps.model.writeScore(messages, signal, onThinking),
    signal,
    emit,
  )
  signal.throwIfAborted()
  const limit = crossedLimit(scoreText(score))
  if (limit) throw new Error(`The Score crossed a limit: ${limit.message}`)
  const updated = await updateSession(deps.store, session.id, (latest) => {
    const { scoreThinking: _, ...rest } = latest
    return {
      ...rest,
      score,
      scoreTimings: { text: secondsSince(start) },
      scoreModel: deps.model.name,
      ...(thinking ? { scoreThinking: thinking } : {}),
    }
  })
  emit({ type: 'score', score, session: updated })
  return updated
}

/** Replaces the Score, edited by hand; refused if it crosses a Limit. */
export async function setScore(
  store: SessionStore,
  session: RoleplaySession,
  value: unknown,
): Promise<RoleplaySession> {
  const score = cleanScore(value)
  const limit = crossedLimit(scoreText(score))
  if (limit) throw new ScoreLimitError(`That crosses a limit: ${limit.message}`)
  return await updateSession(store, session.id, (latest) => ({ ...latest, score }))
}

/** The music settings a Roleplay keeps, as edited in its Music tab. */
export interface MusicSettings {
  behaviour: MusicBehaviour
  taste: string
}

/** The longest Music taste kept. */
const MAX_TASTE = 2000

/** Replaces the Roleplay's own Behaviour and Music taste (`SESSION_SETTINGS`). */
export async function setMusicSettings(
  store: SessionStore,
  session: RoleplaySession,
  value: unknown,
): Promise<RoleplaySession> {
  const v = (value ?? {}) as Record<string, unknown>
  if (!MUSIC_BEHAVIOURS.includes(v.behaviour as MusicBehaviour)) {
    throw new ScoreError(`behaviour must be one of: ${MUSIC_BEHAVIOURS.join(', ')}`)
  }
  if (typeof v.taste !== 'string') throw new ScoreError('taste must be text')
  const taste = v.taste.trim()
  if (taste.length > MAX_TASTE) {
    throw new ScoreError(`A Music taste can be at most ${MAX_TASTE} characters`)
  }
  return await updateSession(store, session.id, (latest) => ({
    ...latest,
    settings: {
      ...latest.settings,
      musicBehaviour: v.behaviour as MusicBehaviour,
      musicTaste: taste,
    },
  }))
}
