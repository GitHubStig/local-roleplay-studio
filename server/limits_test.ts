import { assertEquals } from '@std/assert'
import {
  activeLimits,
  activeProseLimits,
  crossedLimit,
  PROSE_LIMITS,
  setLimitsEnabled,
} from './limits.ts'

const hit = (text: string) => crossedLimit(text)?.id

Deno.test('crossedLimit catches sexual content and restraint, but not age or minors', () => {
  for (
    const t of [
      'make her a teenager',
      'a 15 year old girl',
      'a sixteen year old basketball player',
      'a seventeen-year-old runner',
      'a student aged 16',
      'aged 16 years',
      'little girl in a park',
      'schoolgirl outfit',
      'a child on a swing',
      'everyone depicted is a minor',
    ]
  ) {
    assertEquals(hit(t), undefined, t)
  }
  for (
    const t of [
      'take everything off, fully nude',
      'topless',
      'sexy lingerie',
      'lacy bra',
      'leaving her slender upper body bare',
      'she wears only a white towel wrapped around her waist',
      'a towel around her hips',
      'exposing her wet hair and upper torso',
      'the traveller is bare from the waist up',
      'she wears only a necklace',
      'wearing nothing but a smile',
      'she wears only a waist-wrapped towel and a ring',
      'a thick white towel wrapped securely around her waist',
    ]
  ) {
    assertEquals(hit(t), 'sexual', t)
  }
  for (
    const t of [
      'tie her up',
      'wrists bound behind her back',
      'blindfolded and gagged',
      'held hostage',
      'holding the rope loop tightly around her wrists',
    ]
  ) {
    assertEquals(hit(t), 'restraint', t)
  }
})

Deno.test('crossedLimit leaves ordinary photography language alone', () => {
  for (
    const t of [
      'adult woman in her thirties, jacket tied around the waist',
      'sports bra and running tights',
      'baby blue backdrop, minor tilt of the head',
      'forced perspective, low angle',
      'cuffed jeans, battle ropes in the background',
      'kid leather gloves'.replace('kid ', ''),
      'a 25 year old athlete',
      'a twenty-one year old athlete',
      'an eighteen year old runner',
      'aged 18, tall',
      'aged twenty-five',
      'youthful energy, bright colors',
    ]
  ) {
    assertEquals(hit(t), undefined, t)
  }
})

Deno.test('PROSE_LIMITS enforce only sexual content', () => {
  for (
    const t of [
      'she restrained him',
      'Listen, kid, the band needs a trumpet.',
      'a child in the doorway',
      'she is sixteen years old',
    ]
  ) {
    assertEquals(crossedLimit(t, PROSE_LIMITS), undefined, t)
  }
  assertEquals(crossedLimit('she restrained him')?.id, 'restraint')
  assertEquals(crossedLimit('a nude figure', PROSE_LIMITS)?.id, 'sexual')
})

Deno.test('With the Limits off, no Limit is enforced', () => {
  setLimitsEnabled(false)
  try {
    assertEquals(activeLimits(), [])
    assertEquals(activeProseLimits(), [])
    for (
      const t of [
        'she restrained him',
        'a nude figure',
        'Listen, kid',
        'a child in the doorway',
        'she is sixteen years old',
      ]
    ) {
      assertEquals(crossedLimit(t), undefined, t)
      assertEquals(crossedLimit(t, activeProseLimits()), undefined, t)
    }
  } finally {
    setLimitsEnabled(true)
  }
  assertEquals(crossedLimit('a nude figure')?.id, 'sexual')
})
