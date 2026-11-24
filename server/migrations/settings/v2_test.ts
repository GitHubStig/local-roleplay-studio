import { assertEquals } from '@std/assert'
import type { V1 } from './v1.ts'
import { v2 } from './v2.ts'

const settings = (sessionsFolder: string) => ({ sessionsFolder, textModel: 'gemma' }) as V1

Deno.test('v2 remembers the Session folder in use', () => {
  assertEquals(v2(settings('/Volumes/Archive/Sessions')).sessionsFolders, [
    '/Volumes/Archive/Sessions',
  ])
})

Deno.test("v2 remembers none for the app's own folder", () => {
  assertEquals(v2(settings('')).sessionsFolders, [])
})

Deno.test('v2 leaves the rest of Settings as they were', () => {
  const { sessionsFolders: _, ...rest } = v2(settings('/Sessions'))
  assertEquals(rest, settings('/Sessions'))
})

Deno.test('v2 remembers none from a file last saved before it had a Session folder', () => {
  assertEquals(v2({ textModel: 'gemma' } as V1).sessionsFolders, [])
})
