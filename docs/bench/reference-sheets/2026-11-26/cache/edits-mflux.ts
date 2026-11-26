/**
 * The player's own Qwen-Image 2.1 edits on this Mac's mflux, by the app's code
 * (`mfluxImageGenerator().edit`), with mflux's step cache (`--use-step-cache`, which the app adds to
 * every Qwen-Image 2.1 Edit since 2026-11-26) and without it. Run with `bin/` first on the PATH:
 * STEP_CACHE=0 takes the flag out, STEP_CACHE=1 leaves it in, without changing the app.
 *
 *   PATH=$PWD/bin:$PATH STEP_CACHE=0|1 deno run -A edits-mflux.ts <out> <label> <seed> <case>...
 *
 * Each case is `name:picture.png:mask.png|-:instruction`, the files in `out`; each result is
 * `<name>-<label>.png`, printed with its time and the least available memory meanwhile.
 */
import { mfluxImageGenerator } from '../../../../../server/images/mflux/mflux.ts'
import { DEFAULT_SETTINGS } from '../../../../../server/settings.ts'
import { availableRam } from '../../../memory.ts'

const [out, label, seed, ...cases] = Deno.args
const generator = mfluxImageGenerator()
for (const c of cases) {
  const [name, picture, mask, ...rest] = c.split(':')
  let least = availableRam()
  const watch = setInterval(() => (least = Math.min(least, availableRam())), 500)
  const started = performance.now()
  const file = await generator.edit(
    {
      model: 'qwen-image-2.1-edit',
      image: picture,
      ...(mask !== '-' && { mask }),
      instruction: rest.join(':'),
      seed: Number(seed),
      quantize: DEFAULT_SETTINGS.editQuantize,
      dir: out,
      name: `${name}-${label}`,
    },
    new AbortController().signal,
  )
  clearInterval(watch)
  console.log(
    `${name} ${label}: ${file}, ${Math.round((performance.now() - started) / 1000)} s, least available ${
      (least / 1024 ** 3).toFixed(1)
    } GB`,
  )
}
