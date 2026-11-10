import { assertEquals } from '@std/assert'
import {
  IMAGE_JOBS,
  JOB_KINDS,
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

Deno.test('The web app names every kind of job, and no other', async () => {
  // The web app declares the kinds again (web/src/api.ts) until the two share their types.
  const source = await Deno.readTextFile(new URL('../web/src/jobs.ts', import.meta.url))
  const names = source.slice(source.indexOf('JOB_NAMES'), source.indexOf('\n}\n'))
  const named = [...names.matchAll(/^\s+'?([a-z-]+)'?: '/gm)].map((m) => m[1])
  assertEquals(named.sort(), [...JOB_KINDS].sort())
})
