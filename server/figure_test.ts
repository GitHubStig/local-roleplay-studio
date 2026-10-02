import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { tripoFigureMaker } from './figure.ts'
import { withTempDir } from './testing.ts'

Deno.test('TripoSplat writes the figure, saying while it downloads its weights the first time', () =>
  withTempDir(async (dir) => {
    // The command gets `--image <picture> --out <ply>`; `sh -c` sees them as $1 to $4.
    const maker = tripoFigureMaker({
      command: [
        'sh',
        '-c',
        `echo Downloading TripoSplat >&2; echo Downloaded >&2; printf "ply of $2" > "$4"; echo '{"splats": 32}'`,
        'sh',
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
