/**
 * Stage 4's face pass (docs/reference-sheets-plans.md) over more seeds, by the app's own code
 * (`server/faces/facePass.ts`) on a ComfyUI: each render given is copied into `out`, then face-passed
 * at each seed, the instruction as `server/prompts/faces/` has it now. Prints each pass's timings,
 * whose faces, and whether the count asked for a redo.
 *
 *   deno run -A seeds.ts <comfy address> <session folder> <out> <seeds, comma-separated> <frame>...
 *
 * `STRENGTH=0.92` starts each face's repaint part-way from the render, and `TAG` names the run in
 * the files it writes. (The tight area, the size wording and the sheet whole, tried the same day,
 * were options here then, taken out of the face pass once they lost: see the README.)
 *
 * Each frame is `render.png:Name=identity=sheet.png[:Name=identity=sheet.png]::expression`.
 */
import { join } from 'node:path'
import { comfyuiImageGenerator } from '../../../../server/images/comfyui/comfyui.ts'
import { comfyuiAskPicture } from '../../../../server/heads/comfyui.ts'
import { headFinder } from '../../../../server/heads/heads.ts'
import { twoPasses } from '../../../../server/faces/facePass.ts'
import type { Session, SheetPicture } from '../../../../shared/session.ts'
import type { SessionStore } from '../../../../server/session.ts'
import { DEFAULT_SETTINGS } from '../../../../server/settings.ts'

const [address, folder, out, seedList, ...frames] = Deno.args
await Deno.mkdir(out, { recursive: true })
const backend = { id: 'pc', kind: 'comfyui' as const, address }
const strength = Deno.env.get('STRENGTH')
const tag = Deno.env.get('TAG') ?? 'a'
const way = twoPasses({
  ...(strength && { strength: Number(strength) }),
  store: { dir: () => out } as unknown as SessionStore,
  imageGenerator: comfyuiImageGenerator({ address }),
  heads: headFinder(comfyuiAskPicture({ address })),
  settings: () => Promise.resolve(DEFAULT_SETTINGS),
  backendOf: () => Promise.resolve(backend),
})
const copy = async (file: string) => {
  await Deno.copyFile(join(folder, file), join(out, file)).catch(() => {})
  return file
}
for (const frame of frames) {
  const [people, expression] = frame.split('::')
  const [render, ...who] = people.split(':')
  await copy(render)
  const sheets = await Promise.all(who.map(async (w) => {
    const [subject, identity, file] = w.split('=')
    await copy(file)
    const views = [1, 2, 3].map((i) => file.replace('.png', `-view${i}.png`))
    const mirrored = views.map((v) => v.replace('.png', '-mirrored.png'))
    for (const f of [...views, ...mirrored]) await copy(f)
    const made = { file, views, mirrored, imageModel: '', createdAt: '' } as unknown as SheetPicture
    return { subject, identity, made }
  }))
  for (const seed of seedList.split(',').map(Number)) {
    const started = performance.now()
    const done = await way.repaint(
      { session: { id: 'bench' } as Session, index: 9, file: render, seed: seed - 1, sheets, expression },
      () => {},
      new AbortController().signal,
    )
    const took = Math.round((performance.now() - started) / 1000)
    if ('skipped' in done) {
      console.log(`${render} seed ${seed}: skipped (${done.skipped}), ${took} s`)
      continue
    }
    const named = `${render.replace('.png', '')}-${tag}-seed${seed}.png`
    await Deno.rename(join(out, done.faced.file), join(out, named))
    console.log(
      `${render} seed ${seed}: ${named}, ${took} s, ${JSON.stringify(done.faced.pass)}, missed ${done.faced.missed}`,
    )
  }
}
