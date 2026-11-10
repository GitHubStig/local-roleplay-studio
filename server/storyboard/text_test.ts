import { assertEquals, assertThrows } from '@std/assert'
import {
  parsePlannedFrame,
  parseStoryboardPlan,
  parseStoryboardWrite,
  storyboardPlanSchema,
} from './text.ts'

Deno.test('parsePlannedFrame leaves out "N/A" sentences, and reads who the Frame shows', () => {
  const frame = {
    pose: 'Leaves blow across the square',
    expression: 'N/A (Environmental focus).',
    camera: 'Wide shot',
    clothing: 'No people.',
    environment: 'A town square',
    lighting: 'Street lamps',
    color: 'Green and orange',
    shown: ['Ana', 3, ' '],
  }
  assertEquals(
    parsePlannedFrame({ ...frame, expression: 'n/a', clothing: 'No one is visible' }).body,
    'Leaves blow across the square. Wide shot. A town square. Street lamps. Green and orange.',
  )
  assertEquals(
    parsePlannedFrame({ ...frame, clothing: 'No people, only torn fabric' }).body.includes('torn'),
    true,
  )
  assertEquals(parsePlannedFrame(frame), {
    body:
      'Leaves blow across the square. Wide shot. A town square. Street lamps. Green and orange.',
    shown: ['Ana'],
  })
  assertEquals(parsePlannedFrame({ ...frame, shown: undefined }).shown, [])
})

Deno.test('storyboardPlanSchema asks for the Look, then each Beat with who it shows', () => {
  const schema = storyboardPlanSchema(4)
  assertEquals(Object.keys(schema.properties), ['look', 'beats'])
  assertEquals(schema.properties.beats.minItems, 4)
  assertEquals(schema.properties.beats.items.required, ['beat', 'shown'])
})

Deno.test('parseStoryboardPlan drops the numbers a model puts before its Beats', () => {
  const plan = parseStoryboardPlan(
    JSON.stringify({
      look: { people: [], style: 'Ink.' },
      beats: [
        { beat: '01: Rain falls.', shown: [] },
        { beat: 'Frame 12: A door opens.', shown: ['Ana', 3] },
        { beat: '3 cats sleep.' },
        { beat: 'The roadster speeds on, shown: the red roadster, Elara', shown: ['Elara'] },
        { beat: 'The dog barks (shows: the stray dog).', shown: [] },
      ],
    }),
    5,
  )
  assertEquals(plan.beats, [
    { beat: 'Rain falls.', shown: [] },
    { beat: 'A door opens.', shown: ['Ana'] },
    { beat: '3 cats sleep.', shown: [] },
    { beat: 'The roadster speeds on', shown: ['Elara'] },
    { beat: 'The dog barks', shown: [] },
  ])
  assertThrows(
    () =>
      parseStoryboardPlan(JSON.stringify({ look: { people: [], style: 'Ink.' }, beats: [] }), 3),
    Error,
    "doesn't have 3 Beats",
  )
})

Deno.test('parseStoryboardWrite joins the seven sentences, and needs them all', () => {
  const frame = {
    pose: 'He runs',
    expression: 'Grim.',
    camera: 'Wide shot',
    clothing: 'A coat',
    environment: 'A street',
    lighting: 'Dusk',
    color: 'Grey',
  }
  assertEquals(
    parseStoryboardWrite(JSON.stringify(frame)).body,
    'He runs. Grim. Wide shot. A coat. A street. Dusk. Grey.',
  )
  assertThrows(
    () => parseStoryboardWrite(JSON.stringify({ ...frame, color: '' })),
    Error,
    'missing: color',
  )
  assertThrows(() => parseStoryboardWrite('{'), Error, 'not valid JSON')
})
