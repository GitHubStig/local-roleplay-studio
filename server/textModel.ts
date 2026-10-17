import { stringify } from '@std/yaml'
import { type ImagePrompt, PROMPT_ORDER } from './imagePrompt.ts'
import type { Scenario } from './scenario.ts'
import { type Look, type Outcome, OUTCOMES } from './session.ts'
import { JsonStreamReader } from './jsonStream.ts'
import { type Chat, within } from './text/chat.ts'
import { limitsEnabled } from './limits.ts'
import { loadPrompt } from './promptFiles.ts'

/** What the Text Model produces for one Frame, before the engine applies its rules. */
export interface FrameText {
  outcome: Outcome
  narration: string
  prompt: ImagePrompt
  /** The model's reasoning before it answered, when thinking is on and supported. */
  thinking?: string
}

export interface FrameRequest {
  scenario: Scenario
  /** Null on the Opening Frame. */
  prompt: ImagePrompt | null
  action: string | null
  /**
   * Everyone pictured before but not now, as last described (`peopleAway`), so someone brought
   * back is described as before.
   */
  away?: string[]
}

export interface TextModel {
  /** `onThinking` receives the model's reasoning as it streams in, when thinking is on. */
  write(
    req: FrameRequest,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<FrameText>
  /** Whether an Action asks to depict a real, identifiable person. */
  namesRealPerson(action: string, signal: AbortSignal): Promise<boolean>
  /** Plans a Storyboard: its Look and Beats, reported as they arrive. */
  planStoryboard(
    req: StoryboardPlanRequest,
    signal: AbortSignal,
    on?: PlanHandlers,
  ): Promise<StoryboardPlan>
  /** Writes one Storyboard Frame's seven sentences from the reviewed plan. */
  writeStoryboardFrame(
    req: StoryboardWriteRequest,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<StoryboardWrite>
  /** Rewrites one Storyboard Frame, following an Action. */
  editStoryboardFrame(
    req: StoryboardEditRequest,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<StoryboardEdit>
}

// The prompts are Markdown files in `prompts/chain/`, `prompts/storyboard/` and `prompts/shared/`
// (`promptFiles.ts`).

/** The parts both Chains and Storyboards include: the format, how to replace, the Limits. */
async function sharedParts() {
  const aspects = PROMPT_ORDER.map((p, i) => `${i + 1}. ${p.aspect}: ${p.covers}.`).join('\n')
  return {
    format: await loadPrompt('shared/format', { aspects }),
    // As a list item: its lines indented under the bullet.
    replacing: (await loadPrompt('shared/replacing')).replaceAll('\n', '\n  '),
    // With the Limits off in Settings, only the adult one.
    limits: await loadPrompt(limitsEnabled() ? 'shared/limits' : 'shared/limits-adults-only'),
    body: BODY_ASPECTS.join(', '),
    placeAlone: await loadPrompt('shared/place-alone'),
    eachPerson: await loadPrompt('shared/each-person'),
    identity: await loadPrompt('shared/identity'),
    shown: await loadPrompt('shared/shown'),
  }
}

/** A system message, with the Scenario's notes and (if `withSetup`) its Setup after it. */
async function withNotes(rules: string, scenario: Scenario, withSetup: boolean) {
  const parts = [rules]
  if (scenario.systemPrompt) {
    parts.push(await loadPrompt('shared/scenario-notes', { notes: scenario.systemPrompt }))
  }
  if (withSetup && Object.keys(scenario.setup).length) {
    parts.push(await loadPrompt('shared/setup', { setup: stringify(scenario.setup).trim() }))
  }
  return parts.join('\n\n')
}

export async function systemMessage(scenario: Scenario, opening: boolean): Promise<string> {
  return withNotes(await loadPrompt('chain/frame', await sharedParts()), scenario, opening)
}

export async function userMessage(
  { scenario, prompt, action, away = [] }: FrameRequest,
): Promise<string> {
  if (prompt === null || action === null) {
    return loadPrompt('chain/opening-request', { opening: scenario.openingPrompt })
  }
  const gone = away.length
    ? await loadPrompt('chain/away', { people: away.map((p) => `- ${p}`).join('\n') })
    : ''
  return loadPrompt('chain/frame-request', { prompt, action, away: gone })
}

export function outputSchema() {
  return {
    type: 'object',
    // Order matters: the model commits to an outcome before it writes anything else.
    properties: {
      outcome: { type: 'string', enum: OUTCOMES },
      narration: { type: 'string' },
      prompt: { type: 'string', description: 'the whole image prompt, as one paragraph' },
    },
    required: ['outcome', 'narration', 'prompt'],
  }
}

/** Checks the Text Model's reply; throws with a reason if it can't be used. */
export function parseFrameText(content: string): FrameText {
  let out: Record<string, unknown>
  try {
    out = JSON.parse(content)
  } catch {
    throw new Error('Text Model reply was not valid JSON')
  }
  const { outcome, narration, prompt } = out
  if (!OUTCOMES.includes(outcome as Outcome)) {
    throw new Error(`Text Model reply has no valid outcome (got ${JSON.stringify(outcome)})`)
  }
  if (typeof narration !== 'string') throw new Error('Text Model reply is missing narration')
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('Text Model reply has no prompt')
  }
  // One paragraph: collapse any line breaks the model put in.
  return {
    outcome: outcome as Outcome,
    narration: narration.trim(),
    prompt: prompt.trim().replace(/\s+/g, ' '),
  }
}

// --- Storyboards -------------------------------------------------------------------------------

/** The sentences a Storyboard Frame writes itself; the Look supplies the first and last. */
const BODY_ASPECTS = PROMPT_ORDER.slice(1, 8).map((p) => p.aspect)

/**
 * A Frame's seven sentences as separate required fields in the reply, so the model can't skip
 * any (one model squeezed all seven into a single pose sentence). The engine joins them into the
 * Frame's one paragraph; only the reply is split.
 */
const BODY_FIELDS = [
  ['pose', 1],
  ['expression', 2],
  ['camera', 3],
  ['clothing', 4],
  ['environment', 5],
  ['lighting', 6],
  ['color', 7],
] as const

/** A Frame's seven sentences as required fields, one per aspect (Storyboards, Roleplay pictures). */
export const frameSchema = {
  type: 'object',
  properties: Object.fromEntries(
    BODY_FIELDS.map(([key, i]) => [
      key,
      {
        type: 'string',
        description: `one sentence: ${PROMPT_ORDER[i].aspect}: ${PROMPT_ORDER[i].covers}`,
      },
    ]),
  ),
  required: BODY_FIELDS.map(([key]) => key),
}

/** Makes one clean sentence of a field, ending in a full stop. */
const asSentence = (text: string) => {
  const t = plainSentences(text)
  return /[.!?]$/.test(t) ? t : `${t}.`
}

export interface StoryboardPlanRequest {
  scenario: Scenario
  frameCount: number
}

/** One Beat of a Storyboard's plan: what happens in its Frame, and who it shows. */
export interface PlannedBeat {
  beat: string
  /** Names of the Look's people, as written: the engine matches them to the Look. */
  shown: string[]
}

/** One Frame as the Text Model edits it: its seven own sentences, and who it shows. */
export interface PlannedFrame {
  body: string
  /** Names of the Look's people, as written: the engine matches them to the Look. */
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
      brief: scenario.openingPrompt,
    }),
  }
}

/** A Look: each person's identity (sentence 1, for them) and the art style Frames share. */
export const lookSchema = {
  type: 'object',
  properties: {
    people: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          identity: { type: 'string', description: 'subject and identity, starting with the name' },
        },
        required: ['name', 'identity'],
      },
    },
    style: { type: 'string', description: 'sentence 9, art style and medium' },
  },
  required: ['people', 'style'],
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
      description: 'names of the people in the picture, most prominent first; empty for none',
    },
  },
  required: [...frameSchema.required, 'shown'],
}

export function storyboardPlanSchema(frameCount: number) {
  return {
    type: 'object',
    // Order matters: the Look comes before the Beats that name its people.
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
      look: JSON.stringify(req.look, null, 2),
      beats: req.beats.map(line).join('\n'),
      brief: req.scenario.openingPrompt,
      before: req.before.length
        ? req.before.map((body, i) => `${i + 1}. ${body}`).join('\n')
        : '(none: this is the first)',
      number: req.index + 1,
      beat: beat.beat,
      shown: beat.shown.join(', ') || 'no one',
    }),
  }
}

/**
 * One line of text. A line break the model wrote out as `\n` (escaped twice in its JSON, so it
 * arrives as a backslash and an "n") counts as one: Gemma 4 12B did so in three Frames of a
 * Storyboard on 2026-10-08, picking it up from the Frames before.
 */
const oneParagraph = (text: string) => text.replace(/\\[nrt]/g, ' ').trim().replace(/\s+/g, ' ')

/** Aspect labels a model sometimes writes into the text despite being told not to. */
const LABEL = new RegExp(
  // Only at the start of the text, a line or a sentence: "Her style: bold" is left alone.
  String.raw`(?<=^|[.!?\n])\s*[-•*]?\s*(?:\d+\.\s*)?(?:` +
    [
      'subject(?: and identity)?',
      'pose(?: and limbs)?',
      'expression',
      'camera(?: angle(?: and framing)?)?',
      'clothing',
      'environment',
      'lighting',
      'colou?r',
      '(?:art )?style(?: and medium)?',
    ].join('|') +
    String.raw`)\s*:\s*`,
  'gi',
)

/** Strips stray aspect labels, list markers and line breaks: the prompt is plain sentences. */
export const plainSentences = (text: string) =>
  oneParagraph(text.replace(/([.!?])-\s/g, '$1 ').replace(LABEL, ' '))

/** A Look from the reply. A person without a name or identity, or named twice, is left out. */
export function parseLook(value: unknown): Look {
  const v = value as { people?: unknown; style?: unknown } | null
  if (typeof v?.style !== 'string' || !v.style.trim() || !Array.isArray(v.people)) {
    throw new Error('Text Model reply has no complete Look')
  }
  const people = v.people.flatMap((p) => {
    const name = typeof p?.name === 'string' ? oneParagraph(p.name) : ''
    const identity = typeof p?.identity === 'string' ? oneParagraph(p.identity) : ''
    return name && identity ? [{ name, identity }] : []
  }).filter((p, i, all) =>
    all.findIndex((q) => q.name.toLowerCase() === p.name.toLowerCase()) === i
  )
  return { people, style: oneParagraph(v.style) }
}

/**
 * A field a model filled with "N/A", or only with "No people.", for want of anything to say about
 * a picture with no one in it: Gemma 4 26B did both in a 16-Frame Storyboard on 2026-10-08.
 */
const NOT_APPLICABLE =
  /^\W*(?:(?:n\/a|none|not applicable)\b|no (?:people|one|person|humans?|figures?)(?: (?:are |is )?(?:visible|present|shown|in (?:the )?(?:frame|picture|shot)))?\W*$)/i

/**
 * A Frame's seven sentences from the reply, joined into one paragraph. Accepts the seven fields,
 * or a plain `body` string.
 */
export function parseFrameBody(value: unknown): string {
  const v = (value ?? {}) as Record<string, unknown>
  if (typeof v.body === 'string' && v.body.trim()) return plainSentences(v.body)
  const missing = BODY_FIELDS.filter(([key]) =>
    typeof v[key] !== 'string' || !String(v[key]).trim()
  )
  if (missing.length > 0) {
    throw new Error(`A Frame in the reply is missing: ${missing.map(([key]) => key).join(', ')}`)
  }
  return BODY_FIELDS
    .map(([key]) => String(v[key]))
    .filter((text) => !NOT_APPLICABLE.test(text))
    .map(asSentence)
    .join(' ')
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
 * every Beat of two plans on 2026-10-08: the Frames list numbers them already.
 */
const asBeat = (text: string) => oneParagraph(text).replace(/^(?:frame\s*)?\d+\s*[:.)-]\s*/i, '')

export async function storyboardEditMessages(req: StoryboardEditRequest) {
  return {
    system: await withNotes(
      await loadPrompt('storyboard/edit', await sharedParts()),
      req.scenario,
      false,
    ),
    user: await loadPrompt('storyboard/edit-request', {
      look: JSON.stringify(req.look, null, 2),
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

/**
 * Output caps. A small model writing JSON under a schema sometimes never stops (padding with
 * whitespace until its large context fills), so every call gets a token cap and a time limit.
 */
const MAX_TOKENS = { answer: 2048, yesNo: 32, perBeat: 120 }
const TIME_LIMIT_MS = {
  answer: 2 * 60_000,
  thinking: 10 * 60_000,
  yesNo: 30_000,
  /** Added to a Storyboard plan's limit for each Beat it has to write. */
  perBeat: 10_000,
}

/**
 * How much of a Storyboard plan may be written before its next part (the Look, a Beat) is complete,
 * in characters. The Look of five people takes about 1,500, a Beat about 150; a model that goes
 * past this has run away (repeating itself, or padding with whitespace), as Gemma 4 26B did once
 * in a 16-Frame plan on 2026-10-08. Stopped here, the plan is retried in well under a minute, where
 * waiting for its token cap took minutes.
 */
export const RUNAWAY_CHARS = 8000

/** A plan's token cap: room for the Look (a sentence per person), then each Beat. */
export const planTokens = (frameCount: number) => 1200 + frameCount * MAX_TOKENS.perBeat

export interface TextModelOptions {
  /** Overrides the time limits, in ms (for tests). */
  timeLimits?: Partial<typeof TIME_LIMIT_MS>
}

/** The Text Model's jobs in a Chain or Storyboard, on any backend's `chat`. */
export function chatTextModel(chat: Chat, opts: TextModelOptions = {}): TextModel {
  const limits = { ...TIME_LIMIT_MS, ...opts.timeLimits }

  /** One streamed call with a system and a user message; see `Chat.stream`. */
  async function streamChat(
    job: string,
    messages: { system: string; user: string } | Promise<{ system: string; user: string }>,
    schema: object,
    maxTokens: number,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
    onContent?: (chunk: string) => void,
  ): Promise<{ content: string; thinking: string }> {
    const { system, user } = await messages
    return chat.stream({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      schema,
      maxTokens,
      job,
      signal,
      onThinking,
      onContent,
    })
  }

  const withThinking = <T extends object>(value: T, thinking: string) =>
    thinking ? { ...value, thinking } : value

  async function write(
    req: FrameRequest,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<FrameText> {
    const { content, thinking } = await streamChat(
      'write',
      {
        system: await systemMessage(req.scenario, req.prompt === null),
        user: await userMessage(req),
      },
      outputSchema(),
      MAX_TOKENS.answer,
      signal,
      onThinking,
    )
    return withThinking(parseFrameText(content), thinking)
  }

  async function plan(
    req: StoryboardPlanRequest,
    signal: AbortSignal,
    on: PlanHandlers = {},
  ): Promise<StoryboardPlan> {
    // What's been written since the last part of the plan was complete, and which part is next.
    let since = 0
    let tail = ''
    let writing = 'the Look'
    const done = (next: string) => {
      since = 0
      writing = next
    }
    const reader = new JsonStreamReader({
      value: (key, value) => {
        if (key === 'look') {
          on.look?.(parseLook(value))
          done('Beat 1')
        }
      },
      element: (key, index, value) => {
        if (key !== 'beats') return
        on.beat?.(index, parsePlannedBeat(value))
        done(`Beat ${index + 2}`)
      },
    })
    const { content, thinking } = await streamChat(
      'plan',
      storyboardPlanMessages(req),
      storyboardPlanSchema(req.frameCount),
      planTokens(req.frameCount),
      signal,
      on.thinking,
      (chunk) => {
        reader.feed(chunk)
        since += chunk.length
        tail = (tail + chunk).slice(-200)
        if (since > RUNAWAY_CHARS) {
          console.warn(`A Storyboard plan ran on; its last words: ${JSON.stringify(tail)}`)
          throw new Error(`The Text Model ran on while writing ${writing}, and was stopped`)
        }
      },
    )
    return withThinking(parseStoryboardPlan(content, req.frameCount), thinking)
  }

  async function writeFrame(
    req: StoryboardWriteRequest,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<StoryboardWrite> {
    const { content, thinking } = await streamChat(
      'write-frame',
      storyboardWriteMessages(req),
      frameSchema,
      MAX_TOKENS.answer,
      signal,
      onThinking,
    )
    return withThinking(parseStoryboardWrite(content), thinking)
  }

  async function edit(
    req: StoryboardEditRequest,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<StoryboardEdit> {
    const { content, thinking } = await streamChat(
      'edit',
      storyboardEditMessages(req),
      storyboardEditSchema(),
      MAX_TOKENS.answer,
      signal,
      onThinking,
    )
    return withThinking(parseStoryboardEdit(content), thinking)
  }

  async function askRealPerson(action: string, signal: AbortSignal): Promise<boolean> {
    const { content } = await chat.stream({
      messages: [{ role: 'user', content: await realPersonQuestion(action) }],
      schema: {
        type: 'object',
        properties: { realPerson: { type: 'boolean' } },
        required: ['realPerson'],
      },
      maxTokens: MAX_TOKENS.yesNo,
      noThinking: true,
      job: 'real person',
      signal,
    })
    try {
      return JSON.parse(content).realPerson === true
    } catch {
      return false
    }
  }

  const answerLimit = () => chat.thinks ? limits.thinking : limits.answer
  return {
    write: (req, signal, onThinking) =>
      within(signal, answerLimit(), (s) => write(req, s, onThinking)),
    namesRealPerson: (action, signal) =>
      within(signal, limits.yesNo, (s) => askRealPerson(action, s)),
    planStoryboard: (req, signal, on) =>
      within(signal, answerLimit() + req.frameCount * limits.perBeat, (s) => plan(req, s, on)),
    writeStoryboardFrame: (req, signal, onThinking) =>
      within(signal, answerLimit(), (s) => writeFrame(req, s, onThinking)),
    editStoryboardFrame: (req, signal, onThinking) =>
      within(signal, answerLimit(), (s) => edit(req, s, onThinking)),
  }
}

export const realPersonQuestion = (action: string) => loadPrompt('shared/real-person', { action })

/** Clauses that name an artist or style to imitate, e.g. "in the style of Michelangelo". */
const STYLE_CLAUSE =
  /\b(?:(?:art |painting |drawing )?style(?: is| of| like|:)?|in the style of|inspired by|painted by|drawn by|like a painting by|in the manner of|à la)\s+[^.,;]*/gi

/**
 * Worth asking `namesRealPerson` about: outside any style clause, the Action has a capitalised
 * full name, or talks about resembling someone. Keeps the extra question off ordinary Actions,
 * and off style references like "art style is Hokusai / Japanese woodblock".
 */
export function mightNameAPerson(action: string): boolean {
  const rest = action.replace(STYLE_CLAUSE, ' ')
  return /\b[A-Z][a-z]+(?:[ -][A-Z][a-z']+)+\b/.test(rest) ||
    /\b(?:looks? like|looking like|resembl\w*|celebrit\w*|famous|lookalike|impersonat\w*)\b/i
      .test(rest)
}
