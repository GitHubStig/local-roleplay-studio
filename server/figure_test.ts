import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { tripoFigureMaker } from './figure.ts'
import { withTempDir } from './testing.ts'

Deno.test('TripoSplat writes the figure, saying while it downloads its weights the first time', () =>
  withTempDir(async (dir) => {
    // The command gets `--image <picture> --out <ply>`, as `Deno.args` 0 to 3.
    const maker = tripoFigureMaker({
      command: [
        'deno',
        'eval',
        `console.error('Downloading TripoSplat'); console.error('Downloaded'); await Deno.writeTextFile(Deno.args[3], 'ply of ' + Deno.args[1]); console.log('{"splats": 32}')`,
      ],
    })
    const seen: boolean[] = []
    const out = join(dir, 'figure-character-1a2b3c4d.ply')
    const made = await maker.make(
      { image: 'p.png', out },
      new AbortController().signal,
      (d) => seen.push(d),
    )
    assertEquals([made, seen, await Deno.readTextFile(out)], [
      { splats: 32 },
      [true, false],
      'ply of p.png',
    ])
  }))
