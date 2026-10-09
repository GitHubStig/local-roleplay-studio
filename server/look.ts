/**
 * A Look: the identities and art style a Session's pictures share, word for word, each picture
 * taking the identities of the people it shows (ADR 0012). A Storyboard's is planned with it; a
 * Roleplay's is written from its Cast and grows as the story brings people into its pictures.
 */
import { asSentences, joinPrompt } from './imagePrompt.ts'
import { crossedLimit } from './limits.ts'
import type { Look, Person } from './session.ts'
import { plainSentences } from './textModel.ts'

/**
 * The most people whose identities one Frame's prompt carries: an Image Model keeps two or three
 * people apart at best, and reads only the start of a long prompt. Others in the picture are
 * described by its own sentences, as a group.
 */
export const MAX_SHOWN = 3

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * The Look's names for the people `names` mentions, in the order given, without repeats. A name
 * not in the Look is dropped; one written longer or shorter ("Cal Reyes" for "Cal") matches by
 * its words.
 */
export function matchShown(people: Person[], names: string[]): string[] {
  const words = (n: string) => n.toLowerCase().split(/\s+/).filter(Boolean)
  const matched = names.map((name) =>
    people.find((p) => sameName(p.name, name)) ??
      people.find((p) => {
        const [a, b] = [words(p.name), words(name)]
        return a.length > 0 && b.length > 0 &&
          (a.every((w) => b.includes(w)) || b.every((w) => a.includes(w)))
      })
  )
  return [...new Set(matched.filter((p) => p !== undefined).map((p) => p.name))]
}

/** Who a Frame's prompt describes: the people it shows, up to `MAX_SHOWN`. */
export function shownPeople(look: Look, shown: string[]): Person[] {
  return matchShown(look.people, shown)
    .slice(0, MAX_SHOWN)
    .map((name) => look.people.find((p) => p.name === name)!)
}

/**
 * A Frame's Image Prompt: the identities of the people it shows (none for a picture of
 * the place alone), the Frame's own sentences, then the Look's style.
 */
export const composePrompt = (look: Look, body: string, shown: string[]) =>
  joinPrompt(
    shownPeople(look, shown).map((p) => asSentences(p.identity)).join(' '),
    body,
    look.style,
  )

/**
 * The names a Frame shows after the Look's people changed: each kept if still in the Look, or
 * else, while the Look has as many people as before, taken to be the person in the same place,
 * renamed; dropped otherwise.
 */
export function renameShown(before: Person[], after: Person[], shown: string[]): string[] {
  const names = shown.map((name) => {
    if (after.some((p) => p.name === name)) return name
    const i = before.findIndex((p) => p.name === name)
    return before.length === after.length && i >= 0 ? after[i].name : undefined
  })
  return names.filter((n) => n !== undefined)
}

const oneLine = (text: string) => text.trim().replace(/\s+/g, ' ')

/**
 * A Look edited by hand, tidied: one-line names, plain sentences. Throws if a person lacks a name
 * or an identity, two share a name, or there's no style.
 */
export function cleanLook(look: Look): Look {
  const clean: Look = {
    people: look.people.map((p) => ({
      name: oneLine(p.name),
      identity: plainSentences(p.identity),
    })),
    style: plainSentences(look.style),
  }
  if (clean.people.some((p) => !p.name || !p.identity)) {
    throw new Error('Each person in the Look needs a name and an identity')
  }
  if (new Set(clean.people.map((p) => p.name.toLowerCase())).size < clean.people.length) {
    throw new Error('Two people in the Look have the same name')
  }
  if (!clean.style) throw new Error('The Look needs a style')
  return clean
}

/** The Limit a Look's identities or style cross, if any. */
export const lookLimit = (look: Look): string | undefined =>
  crossedLimit(`${look.people.map((p) => p.identity).join(' ')} ${look.style}`)?.message
