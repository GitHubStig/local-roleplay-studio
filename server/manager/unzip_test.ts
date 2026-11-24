import { assertEquals } from '@std/assert'
import { escapes, importedTitle } from './unzip.ts'
import { exportName } from '../../shared/sessionZip.ts'
import { SESSION_TITLE_LENGTH } from '../../shared/session.ts'

Deno.test("An entry escapes the Session's folder by a parent folder or an absolute path", () => {
  for (
    const name of ['../x.png', 'calls/../../x', '/x.png', '\\x.png', 'C:/x.png', 'c:x', 'a\\..\\x']
  ) {
    assertEquals(escapes(name), true, name)
  }
  for (const name of ['frame-0-aaaaaaaa.png', 'calls/frame-1.json', '..x.png']) {
    assertEquals(escapes(name), false, name)
  }
})

Deno.test('An imported title is marked only when a Session here has it, and stays within the limit', () => {
  assertEquals(importedTitle('Harbour fog', ['Tavern']), 'Harbour fog')
  assertEquals(importedTitle('Tavern', ['Tavern']), 'Tavern (imported)')
  const long = 'x'.repeat(SESSION_TITLE_LENGTH)
  const marked = importedTitle(long, [long])
  assertEquals([marked.length, marked.endsWith(' (imported)')], [SESSION_TITLE_LENGTH, true])
})

Deno.test("An export is named from its title and id, as a file's name can be", () => {
  assertEquals(
    exportName('The Rain-Soaked Tavern', '20261011-083126-79c6'),
    'the-rain-soaked-tavern-20261011-083126-79c6.zip',
  )
  assertEquals(exportName('Café: “Noir” / 2!', 's1'), 'cafe-noir-2-s1.zip')
  assertEquals(exportName('???', 's1'), 's1.zip')
  assertEquals(exportName('a'.repeat(80), 's1'), `${'a'.repeat(60)}-s1.zip`)
})
