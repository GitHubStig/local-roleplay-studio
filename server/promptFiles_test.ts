import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert'
import { loadPrompt, PromptError } from './promptFiles.ts'
import { testCast } from './roleplay/testing.ts'

/** Every prompt file, with the values its code fills it with. */
const PROMPTS: [string, Record<string, unknown>][] = [
  ['roleplay/character', { ...testCast, limits: 'Limits.' }],
  ['roleplay/opening-request', { ...testCast }],
  ['roleplay/cast', { limits: 'Limits.' }],
  ['roleplay/limits-adults-only', { ...testCast }],
  ['roleplay/cast-request', { brief: 'A storm at sea.', facts: 'none' }],
  ['roleplay/limits', { ...testCast }],
]

Deno.test('every prompt file fills in completely, without its notes', async () => {
  for (const [name, values] of PROMPTS) {
    const text = await loadPrompt(name, values)
    assertEquals(/\{\{|<!--|-->/.test(text), false, name)
    assertEquals(/\n{3,}/.test(text), false, name)
  }
})

Deno.test('loadPrompt fills in text, numbers and YAML blocks', async () => {
  const values = { ...testCast, limits: 'No dragons.' }
  const text = (await loadPrompt('roleplay/character', values)).replace(/\s+/g, ' ')
  assertStringIncludes(text, 'You are Mira Vance')
  assertStringIncludes(text, 'age: 34')
  assertStringIncludes(text, 'weather: A gale.')
  assertStringIncludes(text, 'No dragons.')
})

Deno.test('loadPrompt refuses a placeholder with nothing to fill it', async () => {
  await assertRejects(
    () => loadPrompt('roleplay/character', { character: testCast.character }),
    PromptError,
    '{{persona.name}}',
  )
})
