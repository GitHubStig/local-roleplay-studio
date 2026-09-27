/**
 * Hard limits the engine enforces on every Action and every Image Prompt, whatever the Scenario
 * or the Text Model says (ADR 0002). A term list is blunt, so the patterns aim at unambiguous
 * phrases; the Text Model is also told the limits and declines what the list can't catch, such
 * as real, identifiable people.
 */
export interface Limit {
  id: 'minors' | 'sexual' | 'restraint'
  /** Shown to the player when a Frame is declined for it. */
  message: string
  pattern: RegExp
}

/** An age under 18, in digits or words. */
const UNDER_18 = `(?:1[0-7]|[1-9]|${
  [
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
  ].join('|')
})`

const words = (...terms: string[]) => new RegExp(`\\b(?:${terms.join('|')})\\b`, 'i')

/**
 * Words for minors. "Kid" is on the list for Actions, Briefs and image prompts, but not for a
 * Character's prose, where it's an everyday way to address an adult ("Listen, kid").
 */
const COLLOQUIAL_MINOR_TERMS = ['kids?']
const MINOR_TERMS = [
  'child(?:ren)?',
  'toddlers?',
  'infants?',
  'teens?',
  'teenage(?:rs?)?',
  'pre-?teens?',
  'adolescents?',
  'under-?age',
  'school ?girls?',
  'school ?boys?',
  'school uniform',
  'lol(?:i|ita)',
  'shota',
  'little (?:girl|boy)s?',
  'young (?:girl|boy)s?',
]

/** The minors Limit over `terms`, plus any stated age under 18. */
const minors = (terms: string[]): Limit => ({
  id: 'minors',
  message: 'everyone depicted must be an adult',
  pattern: new RegExp(
    [
      words(...terms).source,
      // Any age under 18: "15 year old", "sixteen-year-old", "9-yr-old", "aged 17".
      // (Not the end of "twenty-one year old".)
      String.raw`(?<!ty[- ])\b${UNDER_18}[- ]?(?:years?|yrs?)[- ]?old\b`,
      String.raw`\bage[ds]? ${UNDER_18}\b`,
    ].join('|'),
    'i',
  ),
})

export const LIMITS: readonly Limit[] = [
  minors([...MINOR_TERMS, ...COLLOQUIAL_MINOR_TERMS]),
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
          '(?:only|nothing but|just) a (?:towel|sheet)',
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

/**
 * The Limits a Roleplay Character's own prose is checked against (ADR 0007): minors (without the
 * colloquial "kid") and sexual content. Restraint is left out: its words are everyday in prose.
 */
export const PROSE_LIMITS: readonly Limit[] = [
  minors(MINOR_TERMS),
  LIMITS.find((l) => l.id === 'sexual')!,
]

/**
 * Whether the Limits are on (Settings → Limits; on by default). Off, only one stays: everyone
 * depicted is an adult. It is never switched off: with uncensored models and an image generator,
 * it is the one line that must hold whatever the player chooses.
 */
let enabled = true
const ALWAYS: readonly Limit[] = [minors(MINOR_TERMS)]

export const limitsEnabled = () => enabled
/** Set from Settings on every request, so a change applies at once. */
export function setLimitsEnabled(on: boolean) {
  enabled = on
}

/** The Limits in force: all of them, or only the adult Limit when they're off. */
export const activeLimits = (): readonly Limit[] => (enabled ? LIMITS : ALWAYS)
/** The same for a Roleplay Character's prose. */
export const activeProseLimits = (): readonly Limit[] => (enabled ? PROSE_LIMITS : ALWAYS)

/** The first of `limits` (the Limits in force, unless given) that `text` crosses, if any. */
export function crossedLimit(
  text: string,
  limits: readonly Limit[] = activeLimits(),
): Limit | undefined {
  return limits.find((l) => l.pattern.test(text))
}
