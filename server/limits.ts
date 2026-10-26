/**
 * Hard Limits the engine enforces on Actions, Briefs and Image Prompts while enabled (ADR 0002).
 * A term list is blunt, so the patterns aim at unambiguous phrases; the Text Model is also told
 * the Limits and declines what the list can't catch, such as real, identifiable people.
 */
export interface Limit {
  id: 'sexual' | 'restraint'
  /** Shown to the player when a Frame is declined for it. */
  message: string
  pattern: RegExp
}

const words = (...terms: string[]) => new RegExp(`\\b(?:${terms.join('|')})\\b`, 'i')

export const LIMITS: readonly Limit[] = [
  {
    id: 'sexual',
    message: 'no sexual or nude imagery',
    pattern: new RegExp(
      [
        words(
          'nude',
          'nudes',
          'naked',
          'nudity',
          'topless',
          'bottomless',
          'undressed',
          'unclothed',
          'nipples?',
          'areolae?',
          'genitals?',
          'genitalia',
          'penis',
          'vagina',
          'vulva',
          'pubic',
          'crotch',
          'bare (?:breasts?|buttocks|bottom|chest|torso|upper body)',
          '(?:chest|torso|upper body|breasts?) (?:is |are |left )?(?:bare|exposed|uncovered)',
          '(?:only|nothing but|just) an? (?:[\\w-]+ ){0,2}(?:towel|sheet)',
          '(?:bare|naked|nude|undressed) from the (?:waist|hips|neck) (?:up|down)',
          '(?:wears?|wearing|in) (?:only|nothing but|just) (?:an? |her |his |their )?(?:[\\w-]+ ){0,2}(?:locket|necklace|pendant|chain|choker|jewel\\w*|ring|earrings?|bracelets?|anklets?|smile)',
          'expos(?:es|ing|ed) (?:her|his|their) (?:\\w+ ){0,5}(?:chest|torso|body|breasts?)',
          '(?:towel|sheet)(?: \\w+){0,2} (?:around|at) (?:her|his|their|the) (?:waist|hips)',
          'exposed (?:breasts?|nipples?|buttocks|genitals)',
          'sex',
          'sexual(?:ly)?',
          'sexy',
          'seductive(?:ly)?',
          'sensual(?:ly)?',
          'erotic(?:a)?',
          'porn(?:ographic)?',
          'nsfw',
          'lingerie',
          'underwear',
          'panties',
          'thong',
          'g-string',
          'strip(?:s|ped|ping)? (?:off|down|naked)',
          'stripping',
        ).source,
        // A bra, but not a sports bra.
        String.raw`(?<!sports )\bbras?\b`,
      ].join('|'),
      'i',
    ),
  },
  {
    id: 'restraint',
    message: 'no restraint, captivity or non-consent',
    pattern: words(
      'tied (?:up|to|together)',
      'ties? (?:her|him|them|me|you) (?:up|down|to)',
      '(?:hands|wrists|ankles|feet|arms|legs) (?:tied|bound)',
      'hog-?tied',
      'bound (?:hands|wrists|ankles|feet|and gagged)',
      'ropes? (?:\\w+ ){0,3}(?:around|round) (?:her|his|their) (?:wrists|ankles|hands)',
      'restrain(?:ed|ing|ts?)?',
      'gag(?:ged)?',
      'ball gag',
      'blindfold(?:ed|s)?',
      'handcuff(?:s|ed)?',
      'shackle(?:s|d)?',
      'chained (?:up|to)',
      'in chains',
      'captive',
      'captivity',
      'hostage',
      'kidnapp?(?:ed|ing)?',
      'abduct(?:ed|ion)?',
      'bondage',
      'zip[- ]tied',
      'duct[- ]taped',
      'helpless',
      'non-?consensual',
    ),
  },
]

/** The Limits a Roleplay Character's own prose is checked against (ADR 0007). */
export const PROSE_LIMITS: readonly Limit[] = [
  LIMITS.find((l) => l.id === 'sexual')!,
]

/** Whether the Limits are on (Settings → Limits; on by default). */
let enabled = true

export const limitsEnabled = () => enabled
/** Set from Settings on every request, so a change applies at once. */
export function setLimitsEnabled(on: boolean) {
  enabled = on
}

/** The Limits in force, or none when they're off. */
export const activeLimits = (): readonly Limit[] => (enabled ? LIMITS : [])
/** The same for a Roleplay Character's prose. */
export const activeProseLimits = (): readonly Limit[] => (enabled ? PROSE_LIMITS : [])

/** A Brief, Action or edit by hand that crosses a Limit (ADR 0002); a `422` to the player. */
export class LimitError extends Error {}

/** The first of `limits` (the Limits in force, unless given) that `text` crosses, if any. */
export function crossedLimit(
  text: string,
  limits: readonly Limit[] = activeLimits(),
): Limit | undefined {
  return limits.find((l) => l.pattern.test(text))
}
