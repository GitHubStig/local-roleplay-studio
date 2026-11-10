import { assertEquals } from '@std/assert'
import {
  IMAGE_JOBS,
  LATE_JOBS,
  ON_SHOWN_PICTURE,
  RESUMED,
  SESSION_JOBS,
  TEXT_JOBS,
} from './jobKinds.ts'

Deno.test('Each list of job kinds is read from the one table', () => {
  assertEquals([...TEXT_JOBS].sort(), [
    'direct',
    'picture',
    'score-roleplay',
    'speak',
    'speak-thought',
    'steer',
    'voice',
  ])
  assertEquals(
    [...IMAGE_JOBS].sort(),
    ['clip', 'edit', 'figure', 'lito', 'music', 'render', 'scene', 'upscale'],
  )
  assertEquals([...LATE_JOBS].sort(), ['clip', 'music'])
  assertEquals([...RESUMED].sort(), ['clip', 'music'])
  assertEquals([...SESSION_JOBS].sort(), ['score-roleplay', 'style', 'voice'])
  assertEquals([...ON_SHOWN_PICTURE].sort(), ['edit', 'figure', 'lito', 'scene', 'upscale'])
})
