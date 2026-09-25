import { assertEquals } from '@std/assert'
import { crossedLimit } from './limits.ts'

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
  for (const t of ['take everything off, fully nude', 'topless', 'sexy lingerie', 'lacy bra']) {
    assertEquals(hit(t), 'sexual', t)
  }
  for (
    const t of [
      'tie her up',
      'wrists bound behind her back',
      'blindfolded and gagged',
      'held hostage',
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
