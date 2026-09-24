import { assertEquals, assertThrows } from '@std/assert'
import { join } from '@std/path'
import { dirScenarioLibrary, parseScenario } from './scenario.ts'

const valid = `---
title: Test Shoot
description: A short test.
setup:
  location: a studio
---

## System

Stay in the studio.

## Opening

The Subject arrives.
`

Deno.test('parseScenario reads frontmatter and prompt sections', () => {
  const s = parseScenario('test', valid)
  assertEquals(s.id, 'test')
  assertEquals(s.title, 'Test Shoot')
  assertEquals(s.setup, { location: 'a studio' })
  assertEquals(s.systemPrompt, 'Stay in the studio.')
  assertEquals(s.openingPrompt, 'The Subject arrives.')
})

Deno.test('parseScenario needs only a title, a description and an Opening', () => {
  const s = parseScenario('min', `---\ntitle: T\ndescription: D\n---\n## Opening\nGo.\n`)
  assertEquals(s.setup, {})
  assertEquals(s.systemPrompt, '')
})

Deno.test('parseScenario lists every problem at once', () => {
  const text = `---\ntitle: ""\nsetup: [1]\n---\n\n## System\n\nx\n`
  const err = assertThrows(() => parseScenario('bad', text))
  for (const expected of ['title', 'description', 'setup', '"## Opening"']) {
    if (!(err as Error).message.includes(expected)) {
      throw new Error(`missing "${expected}" in: ${(err as Error).message}`)
    }
  }
})

Deno.test('parseScenario rejects a file without frontmatter', () => {
  assertThrows(() => parseScenario('bare', '# just markdown'))
})

Deno.test('dirScenarioLibrary loads valid files and reports broken ones', async () => {
  const dir = await Deno.makeTempDir()
  try {
    await Deno.writeTextFile(join(dir, 'good.md'), valid)
    await Deno.writeTextFile(join(dir, 'broken.md'), '---\ntitle: [\n---\n')
    await Deno.writeTextFile(join(dir, 'notes.txt'), 'ignored')
    const lib = dirScenarioLibrary(dir)
    const { scenarios, errors } = await lib.list()
    assertEquals(scenarios.map((s) => s.id), ['good'])
    assertEquals(errors.map((e) => e.file), ['broken.md'])
    assertEquals((await lib.get('good'))?.title, 'Test Shoot')
    assertEquals(await lib.get('broken'), undefined)
  } finally {
    await Deno.remove(dir, { recursive: true })
  }
})

Deno.test('dirScenarioLibrary treats a missing directory as empty', async () => {
  const { scenarios, errors } = await dirScenarioLibrary('/nonexistent/scenarios').list()
  assertEquals(scenarios, [])
  assertEquals(errors, [])
})
