import { assertEquals, assertThrows } from '@std/assert'
import { parseFrameBody, parseLook, plainSentences } from './frameBody.ts'

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
