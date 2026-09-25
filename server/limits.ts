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

export const LIMITS: readonly Limit[] = [
  {
    id: 'minors',
    message: 'everyone depicted must be an adult',
    pattern: new RegExp(
      [
        words(
          'child(?:ren)?',
          'kids?',
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
        ).source,
        // Any age under 18: "15 year old", "sixteen-year-old", "9-yr-old", "aged 17".
        // (Not the end of "twenty-one year old".)
        String.raw`(?<!ty[- ])\b${UNDER_18}[- ]?(?:years?|yrs?)[- ]?old\b`,
        String.raw`\bage[ds]? ${UNDER_18}\b`,
      ].join('|'),
      'i',
    ),
  },
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
          'bare (?:breasts?|buttocks|bottom)',
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

/** The first limit `text` crosses, if any. */
export function crossedLimit(text: string): Limit | undefined {
  return LIMITS.find((l) => l.pattern.test(text))
}
