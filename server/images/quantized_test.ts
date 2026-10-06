import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { findImageModel } from './imageModels.ts'
import { quantizedStore } from './quantized.ts'
import { withTempDir } from '../testing.ts'

const klein = findImageModel('flux2-klein-9b')!
const signal = new AbortController().signal

/** A store whose `save` writes a small file, recording each save; the mflux version is settable. */
function store(root: string) {
  const saves: string[] = []
  let version = '0.20.0'
  let fail: string | null = null
  const s = quantizedStore(root, {
    mfluxVersion: () => Promise.resolve(version),
    async save(model, bits, path) {
      saves.push(`${model.id}@${bits}`)
      await Deno.mkdir(path, { recursive: true })
      await Deno.writeTextFile(join(path, 'weights.safetensors'), 'x'.repeat(1000))
      if (fail) throw new Error(fail)
    },
  })
  return {
    s,
    saves,
    setVersion: (v: string) => (version = v),
    setFail: (f: string | null) => (fail = f),
  }
}

Deno.test('A copy is saved the first time it is needed, then reused', () =>
  withTempDir(async (root) => {
    const { s, saves } = store(root)
    const path = await s.ensure(klein, 8, signal)
    assertEquals(path, join(root, 'flux2-klein-9b-8bit-mflux0.20.0'))
    assertEquals(await s.ensure(klein, 8, signal), path)
    assertEquals(saves, ['flux2-klein-9b@8'])
    const [copy] = await s.list()
    assertEquals([copy.name, copy.modelId, copy.bits, copy.mflux], [
      'flux2-klein-9b-8bit-mflux0.20.0',
      'flux2-klein-9b',
      8,
      '0.20.0',
    ])
    assertEquals(copy.bytes > 1000, true)
  }))

Deno.test('A copy made by another mflux is replaced; other settings are kept', () =>
  withTempDir(async (root) => {
    const { s, saves, setVersion } = store(root)
    await s.ensure(klein, 8, signal)
    await s.ensure(klein, 4, signal)
    setVersion('0.21.0')
    await s.ensure(klein, 8, signal)
    assertEquals(saves, ['flux2-klein-9b@8', 'flux2-klein-9b@4', 'flux2-klein-9b@8'])
    assertEquals((await s.list()).map((c) => c.name), [
      'flux2-klein-9b-4bit-mflux0.20.0',
      'flux2-klein-9b-8bit-mflux0.21.0',
    ])
  }))

Deno.test('A save that fails leaves nothing behind, and is tried again next time', () =>
  withTempDir(async (root) => {
    const { s, saves, setFail } = store(root)
    setFail('out of disk')
    await assertRejects(() => s.ensure(klein, 8, signal), Error, 'out of disk')
    assertEquals([...Deno.readDirSync(root)].length, 0)
    setFail(null)
    await s.ensure(klein, 8, signal)
    assertEquals(saves.length, 2)
  }))

Deno.test('Copies can be deleted by name; anything else is refused', () =>
  withTempDir(async (root) => {
    const { s } = store(root)
    assertEquals(await s.list(), [])
    await s.ensure(klein, 8, signal)
    assertEquals(await s.remove('../etc'), false)
    assertEquals(await s.remove('flux2-klein-9b-4bit-mflux0.20.0'), false)
    assertEquals(await s.remove('flux2-klein-9b-8bit-mflux0.20.0'), true)
    assertEquals(await s.list(), [])
  }))
