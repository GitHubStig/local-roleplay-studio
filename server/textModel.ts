import { stringify } from '@std/yaml'
import { OLLAMA_URL } from './ollama.ts'
import type { Scenario } from './scenario.ts'
import type { Scene } from './session.ts'

/** What the Text Model produces for one Turn, before the engine applies its rules. */
export interface TurnText {
  narration: string
  declined: boolean
  scene: Scene
}

export interface TurnRequest {
  scenario: Scenario
  /** Null on the Opening Turn. */
  scene: Scene | null
  action: string | null
}

export interface TextModel {
  write(req: TurnRequest, signal: AbortSignal): Promise<TurnText>
}

const OUTPUT_RULES = `# Output

Reply with a single JSON object, deciding "declined" before writing anything else:

- "declined": true only if the Action is refused.
- "narration": one to three short present-tense sentences telling the player what happens
  this turn, including anything a character says. If "declined" is true, the narration is
  only the refusal: nothing in the Scene moves or changes.
- "scene": the complete updated Scene, every field filled in; if "declined" is true, the
  current Scene exactly as it was. The image is rendered from the Scene alone, so every
  change the Action makes must be written into it, in concrete visual terms.`

export function systemMessage(scenario: Scenario): string {
  return `${scenario.systemPrompt}\n\n# Setup\n\n${stringify(scenario.setup)}\n${OUTPUT_RULES}`
}

export function userMessage({ scenario, scene, action }: TurnRequest): string {
  if (scene === null || action === null) {
    return `This is the Opening Turn; set "declined" to false.\n\n${scenario.openingPrompt}`
  }
  return `Current Scene:\n\n${JSON.stringify(scene, null, 2)}\n\nThe player's Action:\n\n${action}`
}

export function outputSchema(scenario: Scenario) {
  return {
    type: 'object',
    // Order matters: the model commits to accepting or declining before it narrates.
    properties: {
      declined: { type: 'boolean' },
      narration: { type: 'string' },
      scene: scenario.sceneSchema,
    },
    required: ['declined', 'narration', 'scene'],
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
  const { narration, declined, scene } = out
  if (typeof narration !== 'string' || typeof declined !== 'boolean') {
    throw new Error('Text Model reply is missing narration or declined')
  }
  if (typeof scene !== 'object' || scene === null || Array.isArray(scene)) {
    throw new Error('Text Model reply has no scene object')
  }
  const required = (scenario.sceneSchema.required ?? []) as string[]
  const missing = required.filter((key) => !(key in scene))
  if (missing.length > 0) throw new Error(`Text Model scene is missing: ${missing.join(', ')}`)
  return { narration: narration.trim(), declined, scene: scene as Scene }
}

export function ollamaTextModel(model: string, baseUrl = OLLAMA_URL): TextModel {
  return {
    async write(req, signal) {
      const res = await fetch(new URL('/api/chat', baseUrl), {
        method: 'POST',
        signal,
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          format: outputSchema(req.scenario),
          messages: [
            { role: 'system', content: systemMessage(req.scenario) },
            { role: 'user', content: userMessage(req) },
          ],
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(`Ollama: ${body.error ?? res.status}`)
      }
      const body = await res.json() as { message?: { content?: string } }
      return parseTurnText(body.message?.content ?? '', req.scenario)
    },
  }
}
