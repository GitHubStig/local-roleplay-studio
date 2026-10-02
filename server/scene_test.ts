import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { sharpSceneMaker } from './scene.ts'
import { withTempDir } from './testing.ts'

// The command gets `--image <picture> --out <ply>`; `sh -c` sees them as $1 to $4.
const sh = (script: string) => ['sh', '-c', script, 'sh']

Deno.test('SHARP writes the scene and reports its splats and pivot', () =>
  withTempDir(async (dir) => {
    const out = join(dir, 'scene-0-1a2b3c4d.ply')
    const maker = sharpSceneMaker({
      command: sh(
        `printf "ply of $2" > "$4"; echo loading; echo '{"splats": 9, "pivot": 1.2, "fov": 40, "aspect": 0.75}'`,
      ),
    })
    const made = await maker.make({ image: 'frame.png', out }, new AbortController().signal)
    assertEquals(made, { splats: 9, pivot: 1.2, fov: 40, aspect: 0.75 })
    assertEquals(await Deno.readTextFile(out), 'ply of frame.png')
  }))

Deno.test('A failed scene says why, from the last line SHARP wrote', async () => {
  const maker = sharpSceneMaker({
    command: sh('echo warming up >&2; echo SHARP is not downloaded >&2; exit 1'),
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
      command: sh(
        `echo Downloading SHARP >&2; echo Downloaded >&2; : > "$4"; echo '{"splats": 1, "pivot": 1, "fov": 50, "aspect": 1}'`,
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
