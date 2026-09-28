import type { Reply } from './api'

/** JSON left at the end of a field: a stray brace, with or without quotes around it (`"}'}'}`). */
const TRAILING_JSON = /["'“”‘’\s]*[}\]][\s"'“”‘’}\]]*$/
/** Quote marks around the whole of the dialogue: the screen adds its own. */
const OUTER_QUOTES = /^["'“”‘’\s]+|["“”\s]+$/g

/**
 * A Reply tidied for display, the same way the server tidies new ones (`cleanReply` in
 * server/roleplay/prompt.ts): so Replies saved before it did also show without stray quote marks
 * or JSON fragments.
 */
export function cleanReply(reply: Reply): Reply {
  const tidy = (text: string) => text.replace(TRAILING_JSON, '').trim()
  const dialogue = tidy(reply.dialogue).replace(OUTER_QUOTES, '').trim()
  return {
    internal: tidy(reply.internal),
    actions: tidy(reply.actions),
    dialogue: /^[\s.…"'“”‘’]*$/.test(dialogue) ? '' : dialogue,
  }
}
