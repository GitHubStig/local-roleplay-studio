import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { sharpSceneMaker } from './scene.ts'
import { withTempDir } from '../testing.ts'

// The command gets `--image <picture> --out <ply>`, as `Deno.args` 0 to 3.
const stub = (script: string) => ['deno', 'eval', script]

Deno.test('SHARP writes the scene and reports its splats and pivot', () =>
  withTempDir(async (dir) => {
    const out = join(dir, 'scene-0-1a2b3c4d.ply')
    const maker = sharpSceneMaker({
      command: stub(
        `await Deno.writeTextFile(Deno.args[3], 'ply of ' + Deno.args[1]); console.log('loading'); console.log('{"splats": 9, "pivot": 1.2, "fov": 40, "aspect": 0.75}')`,
      ),
    })
    const made = await maker.make({ image: 'frame.png', out }, new AbortController().signal)
    assertEquals(made, { splats: 9, pivot: 1.2, fov: 40, aspect: 0.75 })
    assertEquals(await Deno.readTextFile(out), 'ply of frame.png')
  }))

Deno.test('A failed scene says why, from the last line SHARP wrote', async () => {
  const maker = sharpSceneMaker({
    command: stub(
      `console.error('warming up'); console.error('SHARP is not downloaded'); Deno.exit(1)`,
    ),
  })
  await assertRejects(
    () => maker.make({ image: 'x.png', out: 'x.ply' }, new AbortController().signal),
    Error,
    'SHARP is not downloaded',
  )
})

Deno.test('SHARP says while it downloads its weights, the first time', () =>
  withTempDir(async (dir) => {
    const maker = sharpSceneMaker({
      command: stub(
        `console.error('Downloading SHARP'); console.error('Downloaded'); await Deno.writeTextFile(Deno.args[3], ''); console.log('{"splats": 1, "pivot": 1, "fov": 50, "aspect": 1}')`,
      ),
    })
    const seen: boolean[] = []
    await maker.make(
      { image: 'x.png', out: join(dir, 'x.ply') },
      new AbortController().signal,
      (d) => seen.push(d),
    )
    assertEquals(seen, [true, false])
  }))
