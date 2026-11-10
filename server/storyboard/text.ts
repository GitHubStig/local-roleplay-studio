/**
 * What the Text Model is asked for a Storyboard (its plan, each Frame's sentences, an edit by
 * Action) and its replies: the messages, the schemas and the parsers.
 */
import type { Scenario } from '../../shared/scenario.ts'
import { OUTCOMES } from '../session.ts'
import type { Look, Outcome } from '../../shared/session.ts'
import { loadPrompt } from '../promptFiles.ts'
import {
  frameSchema,
  lookForModel,
  lookSchema,
  oneParagraph,
  parseFrameBody,
  parseLook,
} from '../frameBody.ts'
import { sharedParts, withNotes } from '../promptParts.ts'

export interface StoryboardPlanRequest {
  scenario: Scenario
  frameCount: number
}

/** One Beat of a Storyboard's plan: what happens in its Frame, and who it shows. */
export interface PlannedBeat {
  beat: string
  /** Names of the Look's Subjects, as written: the engine matches them to the Look. */
  shown: string[]
}

/** One Frame as the Text Model edits it: its seven own sentences, and who it shows. */
export interface PlannedFrame {
  body: string
  /** Names of the Look's Subjects, as written: the engine matches them to the Look. */
  shown: string[]
}

/** A Storyboard's plan: the Look and the Beats, reviewed before the Frames are written. */
export interface StoryboardPlan {
  look: Look
  beats: PlannedBeat[]
  thinking?: string
}

/** Called as parts of a Storyboard's plan arrive, before the whole reply is done. */
export interface PlanHandlers {
  thinking?: (chunk: string) => void
  look?: (look: Look) => void
  beat?: (index: number, beat: PlannedBeat) => void
}

/**
 * One Frame to write from the reviewed plan: every Beat (who each shows by the Look's names), and
 * the sentences of the Frames before it, so it carries on from them.
 */
export interface StoryboardWriteRequest {
  scenario: Scenario
  look: Look
  beats: PlannedBeat[]
  /** The Frame to write. */
  index: number
  /** The seven sentences of each Frame before it, in order. */
  before: string[]
}

export interface StoryboardWrite {
  body: string
  thinking?: string
}

export interface StoryboardEditRequest {
  scenario: Scenario
  look: Look
  /** The Frame being edited. */
  index: number
  body: string
  /** Who it shows. */
  shown: string[]
  action: string
}

export interface StoryboardEdit extends PlannedFrame {
  outcome: Outcome
  narration: string
  thinking?: string
}

export async function storyboardPlanMessages({ scenario, frameCount }: StoryboardPlanRequest) {
  return {
    system: await withNotes(
      await loadPrompt('storyboard/plan', await sharedParts()),
      scenario,
      true,
    ),
    user: await loadPrompt('storyboard/plan-request', {
      frameCount,
      brief: scenario.opening,
    }),
  }
}

/**
 * A Storyboard Frame: its seven sentences, then who it shows. The names come last, as in a
 * Roleplay picture (`artFrameSchema`): gemma4 stalls on such answers put first.
 */
export const storyboardFrameSchema = {
  type: 'object',
  properties: {
    ...frameSchema.properties,
    shown: {
      type: 'array',
      items: { type: 'string' },
      description:
        "names of the Look's subjects in the picture, most prominent first; empty for none",
    },
  },
  required: [...frameSchema.required, 'shown'],
}

export function storyboardPlanSchema(frameCount: number) {
  return {
    type: 'object',
    // Order matters: the Look comes before the Beats that name its Subjects.
    properties: {
      look: lookSchema,
      beats: {
        type: 'array',
        items: {
          type: 'object',
          // The names last, as in a Frame (`storyboardFrameSchema`).
          properties: {
            beat: { type: 'string', description: 'one short line: what happens in this Frame' },
            shown: storyboardFrameSchema.properties.shown,
          },
          required: ['beat', 'shown'],
        },
        minItems: frameCount,
        maxItems: frameCount,
      },
    },
    required: ['look', 'beats'],
  }
}

/** The user message of one Frame's Write: the plan, the Frames before it, and which to write. */
export async function storyboardWriteMessages(req: StoryboardWriteRequest) {
  const line = (b: PlannedBeat, i: number) =>
    `${i + 1}. ${b.beat} (shows: ${b.shown.join(', ') || 'no one'})`
  const beat = req.beats[req.index]
  return {
    system: await withNotes(
      await loadPrompt('storyboard/write', await sharedParts()),
      req.scenario,
      true,
    ),
    user: await loadPrompt('storyboard/write-request', {
      look: JSON.stringify(lookForModel(req.look), null, 2),
      beats: req.beats.map(line).join('\n'),
      brief: req.scenario.opening,
      before: req.before.length
        ? req.before.map((body, i) => `${i + 1}. ${body}`).join('\n')
        : '(none: this is the first)',
      number: req.index + 1,
      beat: beat.beat,
      shown: beat.shown.join(', ') || 'no one',
    }),
  }
}

/** A Storyboard Frame from the reply: its sentences, and who it shows (no one if it didn't say). */
export function parsePlannedFrame(value: unknown): PlannedFrame {
  const shown = (value as { shown?: unknown } | null)?.shown
  return {
    body: parseFrameBody(value),
    shown: Array.isArray(shown) ? shown.filter((n) => typeof n === 'string' && n.trim()) : [],
  }
}

/** A Beat from the reply: its line, and who it shows (no one if it didn't say). */
export function parsePlannedBeat(value: unknown): PlannedBeat {
  const v = value as { beat?: unknown; shown?: unknown } | null
  const beat = typeof v?.beat === 'string' ? asBeat(v.beat) : ''
  if (!beat) throw new Error('A Beat in the reply has no line')
  const shown = v?.shown
  return {
    beat,
    shown: Array.isArray(shown) ? shown.filter((n) => typeof n === 'string' && n.trim()) : [],
  }
}

/** Checks a Storyboard plan; throws with a reason if it can't be used. */
export function parseStoryboardPlan(content: string, frameCount: number): StoryboardPlan {
  let out: { look?: unknown; beats?: unknown }
  try {
    out = JSON.parse(content)
  } catch {
    throw new Error('Text Model reply was not valid JSON')
  }
  const look = parseLook(out.look)
  if (!Array.isArray(out.beats) || out.beats.length !== frameCount) {
    throw new Error(`Text Model reply doesn't have ${frameCount} Beats`)
  }
  return { look, beats: out.beats.map(parsePlannedBeat) }
}

/** Checks one Frame's Write; throws with a reason if it can't be used. */
export function parseStoryboardWrite(content: string): StoryboardWrite {
  try {
    return { body: parseFrameBody(JSON.parse(content)) }
  } catch (err) {
    throw err instanceof SyntaxError ? new Error('Text Model reply was not valid JSON') : err
  }
}

/**
 * A Beat without the number a model puts in front ("01: …", "Frame 12: …"), as Gemma 4 26B did in
 * every Beat of two plans on 2026-10-08: the Frames list numbers them already. Nor with who it
 * shows written on the end (", shown: the red roadster, Elara"), as it did in every Beat of one
 * plan on 2026-10-17: that's in "shown" already.
 */
const asBeat = (text: string) =>
  oneParagraph(text)
    .replace(/^(?:frame\s*)?\d+\s*[:.)-]\s*/i, '')
    .replace(/[\s,;.]*\(?\s*\b(?:shown|shows)\s*:[^)]*\)?\W*$/i, '')

export async function storyboardEditMessages(req: StoryboardEditRequest) {
  return {
    system: await withNotes(
      await loadPrompt('storyboard/edit', await sharedParts()),
      req.scenario,
      false,
    ),
    user: await loadPrompt('storyboard/edit-request', {
      look: JSON.stringify(lookForModel(req.look), null, 2),
      number: req.index + 1,
      body: req.body,
      shown: req.shown.join(', ') || 'no one',
      action: req.action,
    }),
  }
}

export function storyboardEditSchema() {
  return {
    type: 'object',
    properties: {
      outcome: { type: 'string', enum: OUTCOMES },
      narration: { type: 'string' },
      frame: storyboardFrameSchema,
    },
    required: ['outcome', 'narration', 'frame'],
  }
}

/** Checks a Storyboard Frame edit; throws with a reason if it can't be used. */
export function parseStoryboardEdit(content: string): StoryboardEdit {
  let out: Record<string, unknown>
  try {
    out = JSON.parse(content)
  } catch {
    throw new Error('Text Model reply was not valid JSON')
  }
  if (!OUTCOMES.includes(out.outcome as Outcome)) {
    throw new Error(`Text Model reply has no valid outcome (got ${JSON.stringify(out.outcome)})`)
  }
  if (typeof out.narration !== 'string') throw new Error('Text Model reply is missing narration')
  return {
    outcome: out.outcome as Outcome,
    narration: out.narration.trim(),
    ...parsePlannedFrame(out.frame),
  }
}
