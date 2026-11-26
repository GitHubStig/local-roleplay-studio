/**
 * Stage 5's bench (ADR 0045): the app's face pass (`twoPasses`) on edits of a
 * face, on a ComfyUI, told three ways. Each picture given is copied into `out`, then face-passed at
 * each seed, as stage 4's `seeds.ts` does, with the face's instruction as the variant says:
 *
 *   named    the Frame's expression sentence named (`face.md`, as a render's pass is told)
 *   kept     the expression kept as the picture has it (`face-unknown.md`)
 *   change   that, and the edit's own instruction named as a change to keep (`face-edited.md`)
 *
 *   deno run -A passes.ts <comfy address> <session folder> <out> <seeds> <variant> <picture>...
 *
 * Each picture is `edit.png:Name=identity=sheet.png::expression::change`.
 */
import { join } from 'node:path'
import { comfyuiImageGenerator } from '../../../../../server/images/comfyui/comfyui.ts'
import { comfyuiAskPicture } from '../../../../../server/heads/comfyui.ts'
import { headFinder } from '../../../../../server/heads/heads.ts'
import { twoPasses } from '../../../../../server/faces/facePass.ts'
import type { Session, SheetPicture } from '../../../../../shared/session.ts'
import type { SessionStore } from '../../../../../server/session.ts'
import { DEFAULT_SETTINGS } from '../../../../../server/settings.ts'

const [address, folder, out, seedList, variant, ...pictures] = Deno.args
await Deno.mkdir(out, { recursive: true })
const backend = { id: 'pc', kind: 'comfyui' as const, address }
const way = twoPasses({
  store: { dir: () => out } as unknown as SessionStore,
  imageGenerator: comfyuiImageGenerator({ address }),
  heads: headFinder(comfyuiAskPicture({ address })),
  settings: () => Promise.resolve(DEFAULT_SETTINGS),
  backendOf: () => Promise.resolve(backend),
})
const copy = async (from: string, file: string) => {
  await Deno.copyFile(join(from, file), join(out, file)).catch(() => {})
  return file
}
for (const picture of pictures) {
  const [people, expression, change] = picture.split('::')
  const [file, ...who] = people.split(':')
  const sheets = await Promise.all(who.map(async (w) => {
    const [subject, identity, sheet] = w.split('=')
    const views = [1, 2, 3].map((i) => sheet.replace('.png', `-view${i}.png`))
    const mirrored = views.map((v) => v.replace('.png', '-mirrored.png'))
    for (const f of [sheet, ...views, ...mirrored]) await copy(folder, f)
    const made = { file: sheet, views, mirrored, imageModel: '', createdAt: '' } as unknown as SheetPicture
    return { subject, identity, made }
  }))
  for (const seed of seedList.split(',').map(Number)) {
    const started = performance.now()
    const done = await way.repaint(
      {
        session: { id: 'bench' } as Session,
        index: 9,
        file,
        seed: seed - 1,
        sheets,
        expression: variant === 'named' ? expression : '',
        ...(variant === 'change' && { change }),
      },
      () => {},
      new AbortController().signal,
    )
    const took = Math.round((performance.now() - started) / 1000)
    if ('skipped' in done) {
      console.log(`${file} ${variant} seed ${seed}: skipped (${done.skipped}), ${took} s`)
      continue
    }
    const named = `${file.replace('.png', '')}-${variant}-seed${seed}.png`
    await Deno.rename(join(out, done.faced.file), join(out, named))
    console.log(`${file} ${variant} seed ${seed}: ${named}, ${took} s`)
  }
}
