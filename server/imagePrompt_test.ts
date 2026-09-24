import { assertEquals, assertThrows } from '@std/assert'
import { changedSections, parseImagePrompt, renderPrompt } from './imagePrompt.ts'
import { promptWith } from './testing.ts'

Deno.test('renderPrompt joins the sections in order, always starting with "adult"', () => {
  assertEquals(
    renderPrompt(promptWith('sitting')),
    'adult, a person, sitting, calm, eye level, running gear, a studio, softbox, neutral, photo',
  )
})

Deno.test('changedSections names the sections that differ', () => {
  const before = promptWith('sitting')
  assertEquals(changedSections(before, { ...before, pose: 'kneeling', color: 'teal' }), [
    'pose',
    'color',
  ])
  assertEquals(changedSections(before, before), [])
})

Deno.test('parseImagePrompt trims sections and names any missing', () => {
  assertEquals(parseImagePrompt({ ...promptWith('x'), pose: '  kneeling  ' }).pose, 'kneeling')
  assertThrows(() => parseImagePrompt({ pose: 'x' }), Error, 'missing: subject, expression')
})
