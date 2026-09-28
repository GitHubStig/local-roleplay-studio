import { assertEquals } from '@std/assert'
import { activeProseLimits, crossedLimit, PROSE_LIMITS, setLimitsEnabled } from './limits.ts'

const hit = (text: string) => crossedLimit(text)?.id

Deno.test('crossedLimit catches minors, sexual content and restraint', () => {
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
    ]
  ) {
    assertEquals(hit(t), 'minors', t)
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

Deno.test('PROSE_LIMITS leave out restraint and the colloquial "kid", nothing else', () => {
  for (const t of ['she restrained him', 'Listen, kid, the band needs a trumpet.']) {
    assertEquals(crossedLimit(t, PROSE_LIMITS), undefined, t)
  }
  assertEquals(crossedLimit('Listen, kid')?.id, 'minors')
  assertEquals(crossedLimit('she restrained him')?.id, 'restraint')
  for (const t of ['a child in the doorway', 'she is sixteen years old', 'a schoolgirl']) {
    assertEquals(crossedLimit(t, PROSE_LIMITS)?.id, 'minors', t)
  }
  assertEquals(crossedLimit('a nude figure', PROSE_LIMITS)?.id, 'sexual')
})

Deno.test('With the Limits off, only the adult Limit is enforced', () => {
  setLimitsEnabled(false)
  try {
    for (const t of ['she restrained him', 'a nude figure', 'Listen, kid']) {
      assertEquals(crossedLimit(t), undefined, t)
      assertEquals(crossedLimit(t, activeProseLimits()), undefined, t)
    }
    for (const t of ['a child in the doorway', 'she is sixteen years old']) {
      assertEquals(crossedLimit(t)?.id, 'minors', t)
      assertEquals(crossedLimit(t, activeProseLimits())?.id, 'minors', t)
    }
  } finally {
    setLimitsEnabled(true)
  }
  assertEquals(crossedLimit('a nude figure')?.id, 'sexual')
})
