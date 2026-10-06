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
  /** Plans a Storyboard: its Look, Beats and every Frame's sentences, reported as they arrive. */
  planStoryboard(
    req: StoryboardPlanRequest,
    signal: AbortSignal,
    on?: PlanHandlers,
  ): Promise<StoryboardPlan>
  /** Rewrites one Storyboard Frame (and, if the Action asks, the Look). */
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

export function userMessage({ scenario, prompt, action }: FrameRequest): Promise<string> {
  return prompt === null || action === null
    ? loadPrompt('chain/opening-request', { opening: scenario.openingPrompt })
    : loadPrompt('chain/frame-request', { prompt, action })
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

export interface StoryboardPlan {
  look: Look
  beats: string[]
  /** Each Frame's seven own sentences, in order. */
  bodies: string[]
  thinking?: string
}

/** Called as parts of a Storyboard's plan arrive, before the whole reply is done. */
export interface PlanHandlers {
  thinking?: (chunk: string) => void
  look?: (look: Look) => void
  beats?: (beats: string[]) => void
  frame?: (index: number, body: string) => void
}

export interface StoryboardEditRequest {
  scenario: Scenario
  look: Look
  beats: string[]
  /** The Frame being edited. */
  index: number
  body: string
  action: string
}

export interface StoryboardEdit {
  outcome: Outcome
  narration: string
  body: string
  /** The Look after the Action: unchanged unless the Action changed the identity or art style. */
  look: Look
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

/** A Look: the subject-and-identity and art-style sentences Frames share. */
export const lookSchema = {
  type: 'object',
  properties: {
    subject: { type: 'string', description: 'sentence 1, subject and identity' },
    style: { type: 'string', description: 'sentence 9, art style and medium' },
  },
  required: ['subject', 'style'],
}

export function storyboardPlanSchema(frameCount: number) {
  return {
    type: 'object',
    // Order matters: the Look and the plan come before the Frames they shape.
    properties: {
      look: lookSchema,
      beats: {
        type: 'array',
        items: { type: 'string' },
        minItems: frameCount,
        maxItems: frameCount,
      },
      frames: { type: 'array', items: frameSchema, minItems: frameCount, maxItems: frameCount },
    },
    required: ['look', 'beats', 'frames'],
  }
}

const oneParagraph = (text: string) => text.trim().replace(/\s+/g, ' ')

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

export function parseLook(value: unknown): Look {
  const v = value as Partial<Look> | null
  if (
    typeof v?.subject !== 'string' || !v.subject.trim() || typeof v.style !== 'string' ||
    !v.style.trim()
  ) {
    throw new Error('Text Model reply has no complete Look')
  }
  return { subject: oneParagraph(v.subject), style: oneParagraph(v.style) }
}

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
  return BODY_FIELDS.map(([key]) => asSentence(String(v[key]))).join(' ')
}

/** Checks a Storyboard plan; throws with a reason if it can't be used. */
export function parseStoryboardPlan(content: string, frameCount: number): StoryboardPlan {
  let out: { look?: unknown; beats?: unknown; frames?: unknown }
  try {
    out = JSON.parse(content)
  } catch {
    throw new Error('Text Model reply was not valid JSON')
  }
  const look = parseLook(out.look)
  const beats = out.beats
  if (
    !Array.isArray(beats) || beats.length !== frameCount || beats.some((b) => typeof b !== 'string')
  ) {
    throw new Error(`Text Model reply doesn't have ${frameCount} Beats`)
  }
  if (!Array.isArray(out.frames) || out.frames.length !== frameCount) {
    throw new Error(`Text Model reply doesn't have ${frameCount} Frames`)
  }
  return { look, beats: beats.map(oneParagraph), bodies: out.frames.map(parseFrameBody) }
}

export async function storyboardEditMessages(req: StoryboardEditRequest) {
  const beats = req.beats.map((b, i) => `${i === req.index ? '▶' : ' '} ${i + 1}. ${b}`).join('\n')
  return {
    system: await withNotes(
      await loadPrompt('storyboard/edit', await sharedParts()),
      req.scenario,
      false,
    ),
    user: await loadPrompt('storyboard/edit-request', {
      look: JSON.stringify(req.look, null, 2),
      beats,
      number: req.index + 1,
      body: req.body,
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
      frame: frameSchema,
      look: lookSchema,
    },
    required: ['outcome', 'narration', 'frame', 'look'],
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
    body: parseFrameBody(out.frame),
    look: parseLook(out.look),
  }
}

/**
 * Output caps. A small model writing JSON under a schema sometimes never stops (padding with
 * whitespace until its large context fills), so every call gets a token cap and a time limit.
 */
const MAX_TOKENS = { answer: 2048, yesNo: 32, perFrame: 700 }
const TIME_LIMIT_MS = {
  answer: 2 * 60_000,
  thinking: 10 * 60_000,
  yesNo: 30_000,
  /** Added to a Storyboard plan's limit for each Frame it has to write. */
  perFrame: 45_000,
}

/** A Storyboard plan's token cap: room for the Look and Beats, then each Frame. */
export const planTokens = (frameCount: number) => 800 + frameCount * MAX_TOKENS.perFrame

export interface TextModelOptions {
  /** Overrides the time limits, in ms (for tests). */
  timeLimits?: Partial<typeof TIME_LIMIT_MS>
}

/** The Text Model's jobs in a Chain or Storyboard, on any backend's `chat`. */
export function chatTextModel(chat: Chat, opts: TextModelOptions = {}): TextModel {
  const limits = { ...TIME_LIMIT_MS, ...opts.timeLimits }

  /** One streamed call with a system and a user message; see `Chat.stream`. */
  async function streamChat(
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
    const reader = new JsonStreamReader({
      value: (key, value) => {
        if (key === 'look') on.look?.(parseLook(value))
        if (key === 'beats' && Array.isArray(value)) on.beats?.(value.map(String))
      },
      element: (key, index, value) => {
        if (key === 'frames') on.frame?.(index, parseFrameBody(value))
      },
    })
    const { content, thinking } = await streamChat(
      storyboardPlanMessages(req),
      storyboardPlanSchema(req.frameCount),
      planTokens(req.frameCount),
      signal,
      on.thinking,
      (chunk) => reader.feed(chunk),
    )
    return withThinking(parseStoryboardPlan(content, req.frameCount), thinking)
  }

  async function edit(
    req: StoryboardEditRequest,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<StoryboardEdit> {
    const { content, thinking } = await streamChat(
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
      within(signal, answerLimit() + req.frameCount * limits.perFrame, (s) => plan(req, s, on)),
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
