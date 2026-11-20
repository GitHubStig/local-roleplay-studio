import { assertEquals, assertThrows } from '@std/assert'
import { type Dropped, type Migrations, migrations } from './migrate.ts'

// Checked by the type-checker, not run.
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true
  : false
const expectType = <_ extends true>() => {}

interface V1 {
  name: string
}
interface V2 {
  name: string
  tags: string[]
}
interface V3 {
  title: string
  tags: string[]
}
const v1 = (doc: unknown): V1 => doc as V1
const v2 = (doc: V1): V2 => ({ ...doc, tags: [] })
const v3 = ({ name, ...rest }: V2): V3 => ({ ...rest, title: name })
const file: Migrations<V3> = migrations().then(v1).then(v2).then(v3).done((doc): V3 => doc)

Deno.test('migrate runs every step from a file without a version', () => {
  assertEquals(file.migrate({ name: 'a' }, 'test.json'), { title: 'a', tags: [] })
})

Deno.test('migrate runs only the steps after the version a file has', () => {
  // A v2 file: v1 and v2 are skipped, so its tags are kept rather than emptied.
  assertEquals(file.migrate({ version: 2, name: 'a', tags: ['x'] }, 'test.json'), {
    title: 'a',
    tags: ['x'],
  })
})

Deno.test('migrate leaves a file at the latest version as it is, without its version', () => {
  assertEquals(file.migrate({ version: 3, title: 'a', tags: [] }, 'test.json'), {
    title: 'a',
    tags: [],
  })
})

Deno.test('migrate refuses a file from a newer app, naming it', () => {
  assertThrows(
    () => file.migrate({ version: 4 }, 'test.json'),
    Error,
    'test.json is version 4, from a newer app: this one reads up to 3',
  )
})

Deno.test("migrate refuses a version that isn't a whole number, and a file that isn't an object", () => {
  assertThrows(() => file.migrate({ version: '2' }, 'test.json'), Error, 'whole number')
  assertThrows(() => file.migrate({ version: 1.5 }, 'test.json'), Error, 'whole number')
  assertThrows(() => file.migrate([], 'test.json'), Error, "isn't a JSON object")
  assertThrows(() => file.migrate(null, 'test.json'), Error, "isn't a JSON object")
})

Deno.test('stamp puts the latest version first', () => {
  const saved = file.stamp({ title: 'a', tags: [] })
  assertEquals(saved, { version: 3, title: 'a', tags: [] })
  assertEquals(Object.keys(saved)[0], 'version')
})

Deno.test('migrations with no steps reads only version 0', () => {
  const none: Migrations<unknown> = migrations().done((doc): unknown => doc)
  assertEquals(none.latest, 0)
  assertThrows(() => none.migrate({ version: 1 }, 'test.json'), Error, 'reads up to 0')
})

Deno.test('Dropped finds fields the app no longer has, however deep', () => {
  type Kind = { kind: 'a'; a: number } | { kind: 'b'; b: number }
  expectType<Equal<Dropped<{ a: 1; b: 2 }, { a: number }>, 'b'>>()
  expectType<Equal<Dropped<{ a: 1 }, { a: number; b?: 2 }>, never>>()
  expectType<Equal<Dropped<{ x: { y: 1; z: 2 } }, { x: { y: number } }>, 'x.z'>>()
  expectType<Equal<Dropped<{ x?: { y: 1; z: 2 } | null }, { x?: { y: number } | null }>, 'x.z'>>()
  expectType<Equal<Dropped<{ list: { y: 1; z: 2 }[] }, { list: { y: number }[] }>, 'list.z'>>()
  expectType<Equal<Dropped<Record<string, { y: 1 }>, Record<string, { y: number }>>, never>>()
  // Each member of a union is checked against the members it fits.
  expectType<Equal<Dropped<{ kind: 'a'; a: 1 } | { kind: 'b'; b: 1 }, Kind>, never>>()
  expectType<Equal<Dropped<{ kind: 'b'; b: 1; c: 1 }, Kind>, 'c'>>()
})

Deno.test('a chain type-checks only steps in order, ending at a type the latest fits', () => {
  // @ts-expect-error: v3 takes a V2, not what v1 makes
  migrations().then(v1).then(v3)
  // @ts-expect-error: the latest (V2) doesn't fit V3: it has no title
  migrations().then(v1).then(v2).done((doc): V3 => doc)
  // A value added to a list fits without a version.
  const _added: Migrations<{ kind: 'a' | 'b' }> = migrations()
    .then((d: unknown) => d as { kind: 'a' }).done((doc): { kind: 'a' | 'b' } => doc)
  // A field the app dropped gives its name, not Migrations.
  // @ts-expect-error: V2's name is no longer in { tags }
  const _dropped: Migrations<{ tags: string[] }> = migrations().then(v1).then(v2)
    .done((doc): { tags: string[] } => doc)
  const dropped = migrations().then(v1).then(v2).done((doc): { tags: string[] } => doc)
  expectType<Equal<typeof dropped, { droppedFields: 'name' }>>()
})
