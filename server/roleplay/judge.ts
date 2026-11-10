import type { ChatMessage } from '../text/chat.ts'
import { loadPrompt } from '../promptFiles.ts'
import { str } from './prompt.ts'
import type { RoleplaySession } from './types.ts'

/**
 * Whether the player's newest Message breaks one of the Cast's Truths, and if so what happens
 * instead (`judge.md`): decided before the Character replies, and given to it as what happens.
 */
export interface Verdict {
  breaks: boolean
  /** What happens instead; '' when it breaks none. */
  outcome: string
}

export const verdictSchema = {
  type: 'object',
  properties: { breaks: { type: 'boolean' }, outcome: { type: 'string' } },
  required: ['breaks', 'outcome'],
}

export function parseVerdict(value: unknown): Verdict {
  const o = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const outcome = str(o.outcome)
  return o.breaks === true && outcome ? { breaks: true, outcome } : { breaks: false, outcome: '' }
}

/** The judge call for `message`; null when the Cast has no Truths, so there's nothing to judge. */
export async function judgeMessages(
  session: RoleplaySession,
  message: string,
): Promise<ChatMessage[] | null> {
  const cast = session.cast
  if (!cast?.truths.length) return null
  const last = session.frames.at(-1)?.reply
  return [
    {
      role: 'system',
      content: await loadPrompt('roleplay/judge', {
        ...cast,
        truths: cast.truths.map((t) => `- ${t}`).join('\n'),
        others: cast.others.length
          ? await loadPrompt('roleplay/judge-others', {
            list: cast.others.map((o) => `- ${o}`).join('\n'),
          })
          : '',
      }),
    },
    {
      role: 'user',
      content: await loadPrompt('roleplay/judge-request', {
        ...cast,
        last: [last?.actions, last?.dialogue].filter(Boolean).join('\n\n') || '(nothing yet)',
        message,
      }),
    },
  ]
}
