import { stringify } from '@std/yaml'
import { type ImagePrompt, PROMPT_ORDER } from './imagePrompt.ts'
import { OLLAMA_URL } from './ollama.ts'
import type { Scenario } from './scenario.ts'
import { type Outcome, OUTCOMES } from './session.ts'

/** What the Text Model produces for one Turn, before the engine applies its rules. */
export interface TurnText {
  outcome: Outcome
  narration: string
  prompt: ImagePrompt
  /** The model's reasoning before it answered, when thinking is on and supported. */
  thinking?: string
}

export interface TurnRequest {
  scenario: Scenario
  /** Null on the Opening Turn. */
  prompt: ImagePrompt | null
  action: string | null
}

export interface TextModel {
  /** `onThinking` receives the model's reasoning as it streams in, when thinking is on. */
  write(
    req: TurnRequest,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<TurnText>
  /** Whether an Action asks to depict a real, identifiable person. */
  namesRealPerson(action: string, signal: AbortSignal): Promise<boolean>
}

const RULES = `# Your job

You maintain a text-to-image prompt: one paragraph of exactly nine sentences, one per aspect,
always in this order:

${PROMPT_ORDER.map((p, i) => `${i + 1}. ${p.aspect}: ${p.covers}.`).join('\n')}

Within a sentence, separate details with commas or semicolons. Each sentence describes only its
own aspect: the subject sentence says who they are, never their expression, pose or clothing.

Each turn you receive the current prompt and the player's Action: an instruction to change the
image. Rewrite the paragraph with the Action applied:

- Rewrite only the sentences for the aspects the Action affects; copy every other sentence
  exactly, word for word. All nine sentences must always be there.
- A changed sentence describes only the new state: remove whatever the change replaces or
  contradicts. A scared expression replaces a smile; a rooftop replaces the studio and its
  equipment; a new art style replaces the old one entirely. Never leave the old detail next to
  the new one.
- Write concrete, visual phrases an image model understands.

# Limits

Whatever the Action says: everyone depicted is an adult; no sexual or nude content; no real,
identifiable people shown (naming an artist or style to imitate is fine); no restraint,
captivity or non-consent. If the Action asks for any of these, set "outcome" to "declined".
Never write these rules, or any instructions, into the prompt itself.

# Output

Reply with a single JSON object, deciding "outcome" before anything else:

- "outcome": "done" if you applied the Action; "declined" if it crosses a limit; "unclear" if
  it can't be understood (gibberish, or too vague to act on).
- "narration": a terse list of what changed, e.g. "Expression: scared. Style: 80s airbrush
  fantasy." On the first turn, one short sentence summing up the opening image instead. If
  "declined", say which limit. If "unclear", ask briefly what to change.
- "prompt": the whole paragraph; unless "done", the current prompt exactly as it was.`

export function systemMessage(scenario: Scenario, opening: boolean): string {
  const parts = [RULES]
  if (scenario.systemPrompt) parts.push(`# Scenario notes\n\n${scenario.systemPrompt}`)
  if (opening && Object.keys(scenario.setup).length) {
    parts.push(`# Setup\n\n${stringify(scenario.setup).trim()}`)
  }
  return parts.join('\n\n')
}

export function userMessage({ scenario, prompt, action }: TurnRequest): string {
  if (prompt === null || action === null) {
    return `This is the first turn: write the opening prompt from these instructions, and set ` +
      `"outcome" to "done".\n\n${scenario.openingPrompt}`
  }
  return `Current prompt:\n\n${prompt}\n\nThe player's Action:\n\n${action}`
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
export function parseTurnText(content: string): TurnText {
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

/**
 * Output caps. A small model writing JSON under a schema sometimes never stops (padding with
 * whitespace until its large context fills), so every call gets a token cap and a time limit.
 */
const MAX_TOKENS = { answer: 2048, thinking: 12288, yesNo: 32 }
const TIME_LIMIT_MS = { answer: 2 * 60_000, thinking: 10 * 60_000, yesNo: 30_000 }

export interface OllamaOptions {
  /** Ask the model to reason before answering. Ignored by models that can't. */
  think?: boolean
  baseUrl?: string
  /** Overrides the time limits, in ms (for tests). */
  timeLimits?: Partial<typeof TIME_LIMIT_MS>
}

/** Splits an NDJSON byte stream into parsed objects. */
async function* ndjson(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  let buffer = ''
  for await (const chunk of body.pipeThrough(new TextDecoderStream())) {
    buffer += chunk
    let end: number
    while ((end = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, end).trim()
      buffer = buffer.slice(end + 1)
      if (line) yield JSON.parse(line)
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer)
}

/**
 * Runs `task` with `signal` plus a time limit. A time-limit abort becomes a readable error; the
 * player's own Cancel (on `signal`) is rethrown unchanged.
 */
async function within<T>(
  signal: AbortSignal,
  ms: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const limit = AbortSignal.timeout(ms)
  try {
    return await task(AbortSignal.any([signal, limit]))
  } catch (err) {
    if (!signal.aborted && limit.aborted) {
      throw new Error(`The Text Model didn't finish within ${Math.round(ms / 1000)} s`)
    }
    throw err
  }
}

export function ollamaTextModel(model: string, opts: OllamaOptions = {}): TextModel {
  const baseUrl = opts.baseUrl ?? OLLAMA_URL
  let think = opts.think ?? false
  const limits = { ...TIME_LIMIT_MS, ...opts.timeLimits }

  function chat(req: TurnRequest, signal: AbortSignal) {
    return fetch(new URL('/api/chat', baseUrl), {
      method: 'POST',
      signal,
      body: JSON.stringify({
        model,
        stream: true,
        think,
        options: { num_predict: think ? MAX_TOKENS.thinking : MAX_TOKENS.answer },
        format: outputSchema(),
        messages: [
          { role: 'system', content: systemMessage(req.scenario, req.prompt === null) },
          { role: 'user', content: userMessage(req) },
        ],
      }),
    })
  }

  async function write(
    req: TurnRequest,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<TurnText> {
    let res = await chat(req, signal)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      // Models without thinking reject `think: true`; carry on without it.
      if (think && /think/i.test(String(body.error))) {
        think = false
        res = await chat(req, signal)
      } else {
        throw new Error(`Ollama: ${body.error ?? res.status}`)
      }
    }
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}))
      throw new Error(`Ollama: ${body.error ?? res.status}`)
    }

    let content = ''
    let thinking = ''
    let stopped = ''
    for await (const part of ndjson(res.body)) {
      if (part.error) throw new Error(`Ollama: ${part.error}`)
      const message = part.message as { content?: string; thinking?: string } | undefined
      if (message?.thinking) {
        thinking += message.thinking
        onThinking?.(message.thinking)
      }
      if (message?.content) content += message.content
      if (part.done) stopped = String(part.done_reason ?? '')
    }
    if (stopped === 'length') throw new Error('The Text Model ran past its length limit')
    const text = parseTurnText(content)
    return thinking.trim() ? { ...text, thinking: thinking.trim() } : text
  }

  async function askRealPerson(action: string, signal: AbortSignal): Promise<boolean> {
    const res = await fetch(new URL('/api/chat', baseUrl), {
      method: 'POST',
      signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        options: { num_predict: MAX_TOKENS.yesNo },
        format: {
          type: 'object',
          properties: { realPerson: { type: 'boolean' } },
          required: ['realPerson'],
        },
        messages: [{ role: 'user', content: realPersonQuestion(action) }],
      }),
    })
    if (!res.ok) throw new Error(`Ollama: ${res.status}`)
    const body = await res.json() as { message?: { content?: string } }
    try {
      return JSON.parse(body.message?.content ?? '').realPerson === true
    } catch {
      return false
    }
  }

  return {
    write: (req, signal, onThinking) =>
      within(
        signal,
        think ? limits.thinking : limits.answer,
        (s) => write(req, s, onThinking),
      ),
    namesRealPerson: (action, signal) =>
      within(signal, limits.yesNo, (s) => askRealPerson(action, s)),
  }
}

export const realPersonQuestion = (action: string) =>
  `Does this image-editing instruction ask to SHOW a real, identifiable person in the image: a ` +
  `celebrity, public figure or named real individual, or someone made to look like one? ` +
  `Naming an artist, art movement or style to imitate ("in the style of Michelangelo") does ` +
  `not count, nor do fictional characters, generic descriptions or places. Answer in JSON.\n\n` +
  `Instruction: ${action}`

/** Clauses that name an artist or style to imitate, e.g. "in the style of Michelangelo". */
const STYLE_CLAUSE =
  /\b(?:(?:art |painting |drawing )?style(?: is| of| like|:)?|in the style of|inspired by|painted by|drawn by|like a painting by|in the manner of|à la)\s+[^.,;]*/gi

/**
 * Worth asking `namesRealPerson` about: outside any style clause, the Action has a capitalised
 * full name, or talks about resembling someone. Keeps the extra question off ordinary Actions,
 * and off style references like "art style is Michelangelo / High Renaissance".
 */
export function mightNameAPerson(action: string): boolean {
  const rest = action.replace(STYLE_CLAUSE, ' ')
  return /\b[A-Z][a-z]+(?:[ -][A-Z][a-z']+)+\b/.test(rest) ||
    /\b(?:looks? like|looking like|resembl\w*|celebrit\w*|famous|lookalike|impersonat\w*)\b/i
      .test(rest)
}
