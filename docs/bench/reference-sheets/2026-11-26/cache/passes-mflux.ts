/**
 * The app's face pass (`twoPasses`) on this Mac's mflux, told the Frame's expression, on given
 * pictures at given seeds, as `../edits/passes.ts` does on a ComfyUI. Run with `bin/` first on the
 * PATH and `STEP_CACHE=1` to give the edit mflux's step cache (`--use-step-cache`), which the app
 * doesn't, without changing the app.
 *
 *   PATH=$PWD/bin:$PATH [STEP_CACHE=1] deno run -A passes-mflux.ts <session folder> <out> <seeds> <picture>...
 *
 * Each picture is `render.png:Name=identity=sheet.png[:Name=…]::expression`, already in `out`.
 */
import { join } from 'node:path'
import { mfluxImageGenerator } from '../../../../../server/images/mflux/mflux.ts'
import { mfluxAskPicture } from '../../../../../server/heads/mflux.ts'
import { headFinder } from '../../../../../server/heads/heads.ts'
import { twoPasses } from '../../../../../server/faces/facePass.ts'
import type { Session, SheetPicture } from '../../../../../shared/session.ts'
import type { SessionStore } from '../../../../../server/session.ts'
import { DEFAULT_SETTINGS } from '../../../../../server/settings.ts'
import { availableRam } from '../../../memory.ts'

const [folder, out, seedList, ...pictures] = Deno.args
const backend = { id: 'here', kind: 'here' as const, address: '' }
const way = twoPasses({
  store: { dir: () => out } as unknown as SessionStore,
  imageGenerator: mfluxImageGenerator(),
  heads: headFinder(mfluxAskPicture()),
  settings: () => Promise.resolve(DEFAULT_SETTINGS),
  backendOf: () => Promise.resolve(backend),
})
let least = availableRam()
setInterval(() => (least = Math.min(least, availableRam())), 500)
for (const picture of pictures) {
  const [people, expression] = picture.split('::')
  const [file, ...who] = people.split(':')
  const sheets = await Promise.all(who.map(async (w) => {
    const [subject, identity, sheet] = w.split('=')
    const views = [1, 2, 3].map((i) => sheet.replace('.png', `-view${i}.png`))
    const mirrored = views.map((v) => v.replace('.png', '-mirrored.png'))
    for (const f of [sheet, ...views, ...mirrored]) {
      await Deno.copyFile(join(folder, f), join(out, f)).catch(() => {})
    }
    const made = { file: sheet, views, mirrored, imageModel: '', createdAt: '' } as unknown as SheetPicture
    return { subject, identity, made }
  }))
  for (const seed of seedList.split(',').map(Number)) {
    const started = performance.now()
    const done = await way.repaint(
      { session: { id: 'bench' } as Session, index: 9, file, seed: seed - 1, sheets, expression },
      () => {},
      new AbortController().signal,
    )
    const took = Math.round((performance.now() - started) / 1000)
    if ('skipped' in done) {
      console.log(`${file} seed ${seed}: skipped (${done.skipped}), ${took} s`)
      continue
    }
    const named = `${file.replace('.png', '')}-seed${seed}.png`
    await Deno.rename(join(out, done.faced.file), join(out, named))
    console.log(`${file} seed ${seed}: ${named}, ${took} s, available memory at least ${(least / 1e9).toFixed(1)} GB`)
    least = availableRam()
  }
}
Deno.exit(0)
