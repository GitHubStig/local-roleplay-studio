import { assertEquals, assertRejects, assertStringIncludes, assertThrows } from '@std/assert'
import type { Chat } from './text/chat.ts'
import {
  chatTextModel,
  mightNameAPerson,
  outputSchema,
  parseFrameBody,
  parseFrameText,
  parseLook,
  parsePlannedFrame,
  parseStoryboardPlan,
  parseStoryboardWrite,
  plainSentences,
  realPersonQuestion,
  storyboardPlanSchema,
  systemMessage,
  userMessage,
} from './textModel.ts'
import { promptWith, testScenario } from './testing.ts'

Deno.test('systemMessage has the paragraph rules, the order, the limits and the notes', async () => {
  const msg = await systemMessage(testScenario, false)
  assertStringIncludes(msg, 'one paragraph of exactly nine sentences')
  assertStringIncludes(msg, '1. subject and identity:')
  assertStringIncludes(msg, '9. art style and medium:')
  assertStringIncludes(msg, 'Never leave the old detail')
  assertStringIncludes(msg, 'everyone depicted is an adult')
  assertStringIncludes(msg, 'Rules.')
})

Deno.test('systemMessage gives the Setup only on the Opening Frame', async () => {
  assertStringIncludes(await systemMessage(testScenario, true), 'location: a studio')
  assertEquals((await systemMessage(testScenario, false)).includes('location: a studio'), false)
})

Deno.test('userMessage uses the opening instructions on the Opening Frame', async () => {
  const msg = await userMessage({ scenario: testScenario, prompt: null, action: null })
  assertStringIncludes(msg, 'This is the opening')
  assertStringIncludes(msg, 'Start.')
})

Deno.test('userMessage sends only the current Image Prompt and the Action', async () => {
  const msg = await userMessage({
    scenario: testScenario,
    prompt: promptWith('standing'),
    action: 'Sit',
  })
  assertStringIncludes(msg, 'A person, standing,')
  assertStringIncludes(msg, 'Sit')
  assertEquals(msg.includes("aren't in it now"), false)
})

Deno.test('userMessage adds everyone away, for someone brought back', async () => {
  const msg = await userMessage({
    scenario: testScenario,
    prompt: promptWith('standing'),
    action: 'She comes back',
    away: ['the traveller is slender'],
  })
  assertStringIncludes(msg, "aren't in it now")
  assertStringIncludes(msg, '- the traveller is slender')
})

Deno.test('outputSchema asks for the outcome first, then one prompt string', () => {
  const schema = outputSchema()
  assertEquals(Object.keys(schema.properties), ['outcome', 'narration', 'prompt'])
  assertEquals(schema.properties.prompt.type, 'string')
})

Deno.test('parseFrameText accepts a complete reply and flattens the paragraph', () => {
  const text = parseFrameText(
    JSON.stringify({
      outcome: 'done',
      narration: ' Pose: sitting. ',
      prompt: ' A woman,\n\n sitting. ',
    }),
  )
  assertEquals(text.narration, 'Pose: sitting.')
  assertEquals(text.prompt, 'A woman, sitting.')
})

Deno.test('parseFrameText rejects bad replies', () => {
  assertThrows(() => parseFrameText('nope'), Error, 'not valid JSON')
  assertThrows(
    () => parseFrameText(JSON.stringify({ outcome: 'maybe', narration: 'x', prompt: 'x' })),
    Error,
    'no valid outcome',
  )
  assertThrows(
    () => parseFrameText(JSON.stringify({ outcome: 'done', narration: 'x', prompt: '  ' })),
    Error,
    'no prompt',
  )
})

Deno.test('realPersonQuestion says style references are not real people', async () => {
  assertStringIncludes(await realPersonQuestion('art style is Michelangelo'), 'style to imitate')
})

Deno.test('mightNameAPerson flags names and lookalike requests, not ordinary edits', () => {
  for (
    const a of [
      'make her look like Serena Williams',
      'dress her as Taylor Swift',
      'she resembles a famous actress',
    ]
  ) {
    assertEquals(mightNameAPerson(a), true, a)
  }
  for (
    const a of [
      'crouch low',
      'teal backdrop, film noir',
      'swap to an 85mm lens',
      "he's frightened. art style is Hokusai / Japanese woodblock",
      'paint it in the style of Frida Kahlo',
      'inspired by Annie Leibovitz, moody',
    ]
  ) {
    assertEquals(mightNameAPerson(a), false, a)
  }
})

Deno.test('plainSentences strips aspect labels and list markers a model writes in', () => {
  assertEquals(
    plainSentences(
      'He sprints; calves taut.- Expression: Intense focus.\n- Camera angle and framing: Low 24mm. Lighting: harsh.',
    ),
    'He sprints; calves taut. Intense focus. Low 24mm. harsh.',
  )
  assertEquals(
    plainSentences('Her style: bold. A man. 3. Colour: teal.'),
    'Her style: bold. A man. teal.',
  )
})

Deno.test('plainSentences turns a line break written out as \\n into a space', () => {
  // As it arrives after JSON.parse when the model escaped it twice: a backslash, then "n".
  assertEquals(
    plainSentences('She waits.\\nRain falls.\\n\\nDusk.\\t'),
    'She waits. Rain falls. Dusk.',
  )
  // A real one, as before.
  assertEquals(plainSentences('She waits.\nRain falls.'), 'She waits. Rain falls.')
})

Deno.test('parseFrameBody joins the seven fields into one paragraph, in order', () => {
  assertEquals(
    parseFrameBody({
      color: 'Grey tones',
      pose: 'He leaps',
      expression: 'Fierce focus.',
      camera: 'Low angle, 24mm',
      clothing: 'White jersey',
      environment: 'An empty indoor court',
      lighting: 'Hard spotlight',
    }),
    'He leaps. Fierce focus. Low angle, 24mm. White jersey. An empty indoor court. Hard spotlight. Grey tones.',
  )
  assertEquals(parseFrameBody({ body: 'Already a paragraph.' }), 'Already a paragraph.')
  assertThrows(() => parseFrameBody({ pose: 'x' }), Error, 'missing: expression, camera')
})

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

Deno.test("parseLook reads the model's people as Subjects, each named once, and needs a style", () => {
  assertEquals(
    parseLook({
      people: [
        { name: 'Ana', identity: 'Ana, a tall woman.' },
        { name: 'ana', identity: 'Ana again.' },
        { name: 'Ben', identity: '' },
        { name: 'Cal', identity: 'Cal, a\nbig man.' },
      ],
      style: 'Film still.',
    }),
    {
      subjects: [
        { name: 'Ana', identity: 'Ana, a tall woman.' },
        { name: 'Cal', identity: 'Cal, a big man.' },
      ],
      style: 'Film still.',
    },
  )
  assertEquals(parseLook({ people: [], style: 'Ink.' }), { subjects: [], style: 'Ink.' })
  assertThrows(() => parseLook({ subject: 'A man.', style: 'Ink.' }), Error, 'no complete Look')
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
      ],
    }),
    3,
  )
  assertEquals(plan.beats, [
    { beat: 'Rain falls.', shown: [] },
    { beat: 'A door opens.', shown: ['Ana'] },
    { beat: '3 cats sleep.', shown: [] },
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

/** A Chat that streams `content` in small pieces, as a backend does. */
const streamingChat = (content: string): Chat => ({
  model: 'm',
  thinks: false,
  stream: (call) => {
    for (let i = 0; i < content.length; i += 50) call.onContent?.(content.slice(i, i + 50))
    return Promise.resolve({ content, thinking: '' })
  },
})

Deno.test('a Storyboard plan that runs on inside one part is stopped there', async () => {
  const beat = (line: string) => JSON.stringify({ beat: line, shown: [] })
  const start = `{"look": {"people": [], "style": "Ink."}, "beats": [${beat('One')}, `
  const req = { scenario: testScenario, frameCount: 2 }
  const signal = new AbortController().signal
  const beats: string[] = []
  const plan = await chatTextModel(streamingChat(`${start}${beat('Two')}]}`))
    .planStoryboard(req, signal, { beat: (i, b) => beats.push(`${i}: ${b.beat}`) })
  assertEquals(plan.beats.map((b) => b.beat), ['One', 'Two'])
  assertEquals(beats, ['0: One', '1: Two'])

  const runaway = `${start}{"beat": "a${' '.repeat(10_000)}`
  await assertRejects(
    () => chatTextModel(streamingChat(runaway)).planStoryboard(req, signal),
    Error,
    'ran on while writing Beat 2',
  )
})
