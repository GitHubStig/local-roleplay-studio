import { assertEquals } from '@std/assert'
import {
  exactSecondsOf,
  FLOOR_SECONDS,
  higgsText,
  maxFrames,
  SECONDS_A_CHARACTER,
  secondsOf,
} from './higgs.ts'

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

Deno.test('A line may take frames by its length, past the longest a line of that length took', () => {
  // 25 frames a second, and 7 for the codebooks' delay.
  assertEquals(exactSecondsOf(maxFrames('')), FLOOR_SECONDS)
  assertEquals(
    exactSecondsOf(maxFrames('x'.repeat(100))),
    FLOOR_SECONDS + 100 * SECONDS_A_CHARACTER,
  )
  assertEquals(secondsOf(2048), 82)
})
