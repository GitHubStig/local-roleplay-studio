/** What the Text Model is asked for a Chain's Frame, and its reply: the messages, the schema and the parser. */
import type { ImagePrompt } from '../imagePrompt.ts'
import type { Scenario } from '../scenario.ts'
import { type Outcome, OUTCOMES } from '../session.ts'
import { loadPrompt } from '../promptFiles.ts'
import { sharedParts, withNotes } from '../promptParts.ts'

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

export async function systemMessage(scenario: Scenario, opening: boolean): Promise<string> {
  return withNotes(await loadPrompt('chain/frame', await sharedParts()), scenario, opening)
}

export async function userMessage(
  { scenario, prompt, action, away = [] }: FrameRequest,
): Promise<string> {
  if (prompt === null || action === null) {
    return loadPrompt('chain/opening-request', { opening: scenario.opening })
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
