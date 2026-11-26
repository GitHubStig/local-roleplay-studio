/**
 * A Subject's identity is what it looks like, without its name: the name is a field of its own, so
 * the engine puts it in front wherever the identity is used (an Image Prompt, a sheet, the head
 * finder) rather than asking the Text Model to write it twice. Asked to start the identity with
 * the name, moonlight-dusk-uncensored 26b left it out of 24 identities in 24, so its pictures'
 * prompts described people without naming them (2026-11-26).
 */
import type { Subject } from '../shared/session.ts'

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * An identity with its Subject's name taken off the front, where a model or the player wrote it
 * there anyway ("Kael, a 42-year-old man…", "Kael is a…", "Kael: a…"): "a 42-year-old man…".
 */
export function withoutName(name: string, identity: string): string {
  const t = identity.trim()
  if (!name.trim()) return t
  const named = new RegExp(`^${escape(name.trim())}(?:\\s*[,:;–—-]|\\s+is\\b)\\s*`, 'i')
  const rest = t.replace(named, '')
  return rest || t
}

/**
 * A Subject's identity with its name in front, as a picture uses it, starting a sentence: "Kael, a
 * 42-year-old man…", "The barkeep, a stout man…".
 */
export function namedIdentity(subject: Subject): string {
  const name = subject.name.trim()
  const identity = subject.identity.trim().replace(/^(A|An|The)\b/, (w) => w.toLowerCase())
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}, ${identity}`
}
