import { assertEquals } from '@std/assert'
import { JsonStreamReader } from './jsonStream.ts'

const reply = JSON.stringify({
  look: { subject: 'A man {with} "braces".', style: 'Sketch, [pencil].' },
  beats: ['Dribbles', 'Dunks'],
  frames: [{ body: 'He runs; ball low.' }, { body: 'He leaps \\ high.' }],
})

function events(chunks: string[]) {
  const seen: unknown[] = []
  const reader = new JsonStreamReader({
    value: (key, value) => seen.push(['value', key, value]),
    element: (key, index, value) => seen.push(['element', key, index, value]),
  })
  for (const chunk of chunks) reader.feed(chunk)
  return seen
}

const expected = [
  ['value', 'look', { subject: 'A man {with} "braces".', style: 'Sketch, [pencil].' }],
  ['value', 'beats', ['Dribbles', 'Dunks']],
  ['element', 'frames', 0, { body: 'He runs; ball low.' }],
  ['element', 'frames', 1, { body: 'He leaps \\ high.' }],
  ['value', 'frames', [{ body: 'He runs; ball low.' }, { body: 'He leaps \\ high.' }]],
]

Deno.test('JsonStreamReader reports values and elements as they complete', () => {
  assertEquals(events([reply]), expected)
})

Deno.test('JsonStreamReader copes with any chunking, even one character at a time', () => {
  assertEquals(events([...reply]), expected)
  assertEquals(events([reply.slice(0, 7), reply.slice(7, 60), reply.slice(60)]), expected)
})

Deno.test('JsonStreamReader reports nothing for an element that has not finished', () => {
  const seen = events([reply.slice(0, reply.indexOf('He leaps'))])
  assertEquals(seen.length, 3)
})

Deno.test('JsonStreamReader reports top-level strings through text, one character at a time too', () => {
  const content = JSON.stringify({ internal: 'Late \\again.', actions: 'She looks "up".', n: 3 })
  for (const chunks of [[content], [...content]]) {
    const seen: unknown[] = []
    const reader = new JsonStreamReader({ text: (key, value) => seen.push([key, value]) })
    for (const chunk of chunks) reader.feed(chunk)
    assertEquals(seen, [['internal', 'Late \\again.'], ['actions', 'She looks "up".']])
  }
})
