import { stringify } from '@std/yaml'
import { OLLAMA_URL } from './ollama.ts'
import type { Scenario } from './scenario.ts'
import { type Outcome, OUTCOMES, type Scene } from './session.ts'

/** What the Text Model produces for one Turn, before the engine applies its rules. */
export interface TurnText {
  outcome: Outcome
  narration: string
  scene: Scene
  /** The model's reasoning before it answered, when thinking is on and supported. */
  thinking?: string
}

export interface TurnRequest {
  scenario: Scenario
  /** Null on the Opening Turn. */
  scene: Scene | null
  action: string | null
}

export interface TextModel {
  /** `onThinking` receives the model's reasoning as it streams in, when thinking is on. */
  write(
    req: TurnRequest,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<TurnText>
}

const OUTPUT_RULES = `# Output

Reply with a single JSON object, deciding "outcome" before writing anything else:

- "outcome": "done" if the Action is carried out; "declined" if a character refuses it;
  "unclear" if the Action can't be understood (gibberish, or too ambiguous to act on).
- "narration": one to three short present-tense sentences describing only how the characters
  respond this turn: what they do and say. Narrate the result, never the request: don't
  restate or paraphrase the player's Action, and never describe the player or the player's
  character. Only describe what actually happens in the Scene. If "declined", the narration
  is only the refusal. If "unclear", a character asks what the player means. In both cases
  nothing in the Scene moves or changes.
- "scene": the complete updated Scene, every field filled in; unless "done", the current
  Scene exactly as it was. The image is rendered from the Scene alone, so every change the
  Action makes must be written into it, in concrete visual terms.`

export function systemMessage(scenario: Scenario): string {
  return `${scenario.systemPrompt}\n\n# Setup\n\n${stringify(scenario.setup)}\n${OUTPUT_RULES}`
}

export function userMessage({ scenario, scene, action }: TurnRequest): string {
  if (scene === null || action === null) {
    return `This is the Opening Turn; set "outcome" to "done".\n\n${scenario.openingPrompt}`
  }
  return `Current Scene:\n\n${JSON.stringify(scene, null, 2)}\n\nThe player's Action:\n\n${action}`
}

export function outputSchema(scenario: Scenario) {
  return {
    type: 'object',
    // Order matters: the model commits to an outcome before it narrates.
    properties: {
      outcome: { type: 'string', enum: OUTCOMES },
      narration: { type: 'string' },
      scene: scenario.sceneSchema,
    },
    required: ['outcome', 'narration', 'scene'],
  }
}

/** Checks the Text Model's reply; throws with a reason if it can't be used. */
export function parseTurnText(content: string, scenario: Scenario): TurnText {
  let out: Record<string, unknown>
  try {
    out = JSON.parse(content)
  } catch {
    throw new Error('Text Model reply was not valid JSON')
  }
  const { outcome, narration, scene } = out
  if (!OUTCOMES.includes(outcome as Outcome)) {
    throw new Error(`Text Model reply has no valid outcome (got ${JSON.stringify(outcome)})`)
  }
  if (typeof narration !== 'string') throw new Error('Text Model reply is missing narration')
  if (typeof scene !== 'object' || scene === null || Array.isArray(scene)) {
    throw new Error('Text Model reply has no scene object')
  }
  const required = (scenario.sceneSchema.required ?? []) as string[]
  const missing = required.filter((key) => !(key in scene))
  if (missing.length > 0) throw new Error(`Text Model scene is missing: ${missing.join(', ')}`)
  return { outcome: outcome as Outcome, narration: narration.trim(), scene: scene as Scene }
}

export interface OllamaOptions {
  /** Ask the model to reason before answering. Ignored by models that can't. */
  think?: boolean
  baseUrl?: string
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

export function ollamaTextModel(model: string, opts: OllamaOptions = {}): TextModel {
  const baseUrl = opts.baseUrl ?? OLLAMA_URL
  let think = opts.think ?? false

  async function chat(req: TurnRequest, signal: AbortSignal) {
    return await fetch(new URL('/api/chat', baseUrl), {
      method: 'POST',
      signal,
      body: JSON.stringify({
        model,
        stream: true,
        think,
        format: outputSchema(req.scenario),
        messages: [
          { role: 'system', content: systemMessage(req.scenario) },
          { role: 'user', content: userMessage(req) },
        ],
      }),
    })
  }

  return {
    async write(req, signal, onThinking) {
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
      for await (const part of ndjson(res.body)) {
        if (part.error) throw new Error(`Ollama: ${part.error}`)
        const message = part.message as { content?: string; thinking?: string } | undefined
        if (message?.thinking) {
          thinking += message.thinking
          onThinking?.(message.thinking)
        }
        if (message?.content) content += message.content
      }
      const text = parseTurnText(content, req.scenario)
      return thinking.trim() ? { ...text, thinking: thinking.trim() } : text
    },
  }
}
