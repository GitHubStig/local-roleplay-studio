import { assertEquals } from '@std/assert'
import { higgsText } from './higgs.ts'

Deno.test("Higgs's tags: a sound, then a whisper, then the pace", () => {
  assertEquals(higgsText({ text: 'Fine.' }), 'Fine.')
  assertEquals(higgsText({ text: 'Fine.', pace: 'fast' }), '<|prosody:speed_fast|>Fine.')
  assertEquals(higgsText({ text: 'Heavy.', sound: 'laughter' }), '<|sfx:laughter|>Heh Heavy.')
  assertEquals(
    higgsText({ text: 'Stay away from her.', whisper: true, pace: 'slow', sound: 'none' }),
    '<|style:whispering|><|prosody:speed_slow|>Stay away from her.',
  )
})

Deno.test('A slow line pauses between sentences, but not after a one-word one', () => {
  assertEquals(
    higgsText({ text: 'Ah. The room upstairs. Fine. Go on.', pace: 'slow', sound: 'sigh' }),
    '<|sfx:sigh|>Uh <|prosody:speed_slow|>Ah. The room upstairs. <|prosody:pause|>Fine. Go on.',
  )
  assertEquals(
    higgsText({ text: 'Wait… what? No.', pace: 'normal' }),
    'Wait… what? No.',
  )
})
