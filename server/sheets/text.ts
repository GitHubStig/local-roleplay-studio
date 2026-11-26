/**
 * What the Text Model is asked for reference sheets: Change…, a Subject's identity rewritten with
 * the player's note (`prompts/sheets/change*.md`), its schema and its parser.
 */
import type { ChatMessage } from '../text/chat.ts'
import { loadPrompt } from '../promptFiles.ts'
import { limitsEnabled } from '../limits.ts'
import { oneParagraph } from '../frameBody.ts'
import type { Subject } from '../../shared/session.ts'

/** The rewritten identity: one field. */
export const changeSchema = {
  type: 'object',
  properties: {
    identity: {
      type: 'string',
      description: 'the identity, rewritten with the change, without the name',
    },
  },
  required: ['identity'],
}

/** The call that rewrites `subject`'s identity with the player's `note`. */
export async function changeMessages(subject: Subject, note: string): Promise<ChatMessage[]> {
  return [
    {
      role: 'system',
      content: await loadPrompt('sheets/change', {
        identity: await loadPrompt('shared/identity'),
        limits: limitsEnabled() ? await loadPrompt('sheets/change-limits') : '',
      }),
    },
    {
      role: 'user',
      content: await loadPrompt('sheets/change-request', {
        name: subject.name,
        identity: subject.identity,
        note,
      }),
    },
  ]
}

/** The identity from the reply, on one line; throws if it has none. */
export function parseChange(content: string): string {
  let value: { identity?: unknown }
  try {
    value = JSON.parse(content)
  } catch {
    throw new Error('Text Model reply was not valid JSON')
  }
  const identity = typeof value?.identity === 'string' ? oneParagraph(value.identity) : ''
  if (!identity) throw new Error('Text Model reply has no identity')
  return identity
}
