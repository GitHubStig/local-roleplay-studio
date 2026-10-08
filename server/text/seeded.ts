import type { Chat, ChatCall } from './chat.ts'

/** How many different calls are remembered; the oldest is forgotten past this. */
const REMEMBERED = 10_000

/** How many times each Session has made each call (by its hash), oldest first. */
const asked = new Map<string, number>()

/** FNV-1a: a quick 32-bit hash, enough to tell calls apart. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Whose seed a Chat's calls are seeded from. */
export interface Seeding {
  /** The Session's id: each Session counts its own repeats. */
  session: string
  seed: number
}

/**
 * The seed for one call: the Session's, plus a hash of what's asked, plus how many times that
 * Session asked it before. So a Session with a fixed seed, played the same way, asks with the same seeds, in
 * whatever order its calls run; and the same call again (a retry after a bad answer, Suggest
 * pressed twice) is asked with a new seed, so it can come out different. The counts live in
 * memory: after a restart, the first repeat of a call made before it gets that call's first seed.
 */
export function seedFor(
  { session, seed }: Seeding,
  call: Pick<ChatCall, 'messages' | 'schema'>,
): number {
  const h = hash(JSON.stringify([call.messages, call.schema ?? null]))
  const key = `${session}:${h}`
  const times = asked.get(key) ?? 0
  asked.delete(key)
  asked.set(key, times + 1)
  if (asked.size > REMEMBERED) asked.delete(asked.keys().next().value!)
  return (seed + h + times) >>> 0
}

/** `chat`, with each call seeded from a Session's seed (`seedFor`). */
export function seededChat(chat: Chat, seeding: Seeding): Chat {
  return {
    get model() {
      return chat.model
    },
    get thinks() {
      return chat.thinks
    },
    stream: (call) => chat.stream({ ...call, seed: seedFor(seeding, call) }),
  }
}
