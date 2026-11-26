/**
 * Marks on a face, and an earlier edit's change (open threads): the app's face pass (`twoPasses`)
 * on the PC's ComfyUI, as `../edits/passes.ts` runs it, with its instruction as the app builds it
 * (`faceInstruction`), and with `marks` one sentence more, added by a wrapper around the edit model
 * so the app's prompts are unchanged:
 *
 *   MARKS  "Keep whatever is on <name>'s skin and head in image 1, such as marks, wounds, dirt,
 *          wetness or anything worn, exactly as it is."
 *
 * With `marks` 2 instead, the sentence added is "Keep what is on <name> in image 1: <WORN>", the
 * Frame's clothing sentence given as WORN; with 3, the instruction is replaced by one for a thing
 * (`../object/`).
 *
 *   deno run -A passes.ts <comfy address> <session folder> <out> <seeds> <label> <marks 0|1|2|3> <picture>...
 *
 * Each picture is `file.png:Name=sheet.png::expression::change` (`change` empty for a render; for
 * an edit, its instruction, or every instruction in its line, oldest first, for "earlier"), with
 * more `:Name=…` for more people. The picture, the sheets and their views are copied from the
 * session folder into `out` (STRENGTH, if set, repaints each head at it rather than the edit model's
 * own); each result is `<file>-<label>-seed<seed>.png` (one already there is
 * kept, not made again), and the instruction each edit was given is printed.
 */
import { join } from 'node:path'
import { comfyuiImageGenerator } from '../../../../../server/images/comfyui/comfyui.ts'
import { comfyuiAskPicture } from '../../../../../server/heads/comfyui.ts'
import { headFinder } from '../../../../../server/heads/heads.ts'
import { twoPasses } from '../../../../../server/faces/facePass.ts'
import type { ImageGenerator } from '../../../../../server/images/imageGenerator.ts'
import type { Session, SheetPicture } from '../../../../../shared/session.ts'
import type { SessionStore } from '../../../../../server/session.ts'
import { DEFAULT_SETTINGS } from '../../../../../server/settings.ts'

const [address, folder, out, seedList, label, marks, ...pictures] = Deno.args
await Deno.mkdir(out, { recursive: true })
const backend = { id: 'pc', kind: 'comfyui' as const, address }
const generator = comfyuiImageGenerator({ address })
const told: string[] = []
const wrapped: ImageGenerator = {
  ...generator,
  edit(req, signal, onProgress, onDownload) {
    const name = req.instruction.match(/^Give (.+?), the one in the marked area/)?.[1]
    const instruction = marks === '1' && name
      ? `${req.instruction} Keep whatever is on ${name}'s skin and head in image 1, such as marks, wounds, dirt, wetness or anything worn, exactly as it is.`
      : marks === '2' && name
      ? `${req.instruction} Keep what is on ${name} in image 1: ${Deno.env.get('WORN')}`
      : marks === '3' && name
      ? `Give ${name}, the thing in the marked area of image 1, the look of the one in image 2: its shape, materials and details. Keep how it is lit and its state exactly as in image 1, the way it is turned, and everything else.`
      : req.instruction
    told.push(instruction)
    return generator.edit({ ...req, instruction }, signal, onProgress, onDownload)
  },
}
const way = twoPasses({
  store: { dir: () => out } as unknown as SessionStore,
  imageGenerator: wrapped,
  heads: headFinder(comfyuiAskPicture({ address })),
  settings: () => Promise.resolve(DEFAULT_SETTINGS),
  backendOf: () => Promise.resolve(backend),
  // A strength other than the edit model's own (`faceStrength`), if STRENGTH is set.
  ...(Deno.env.get('STRENGTH') && { strength: Number(Deno.env.get('STRENGTH')) }),
})
const copy = (file: string) => Deno.copyFile(join(folder, file), join(out, file)).catch(() => {})
for (const picture of pictures) {
  const [people, expression, change] = picture.split('::')
  const [file, ...who] = people.split(':')
  await copy(file)
  const sheets = await Promise.all(who.map(async (w) => {
    const [subject, sheet] = w.split('=')
    const views = [1, 2, 3].map((i) => sheet.replace('.png', `-view${i}.png`))
    const mirrored = views.map((v) => v.replace('.png', '-mirrored.png'))
    for (const f of [sheet, ...views, ...mirrored]) await copy(f)
    const made = { file: sheet, views, mirrored, imageModel: '', createdAt: '' } as unknown as SheetPicture
    // The identity only finds the head; the instruction doesn't use it.
    const identity = Deno.env.get(`IDENTITY_${subject.replace(/\W/g, '_')}`) ?? subject
    return { subject, identity, made }
  }))
  for (const seed of seedList.split(',').map(Number)) {
    const named = `${file.replace('.png', '')}-${label}-seed${seed}.png`
    // Made by an earlier run: kept, not made again.
    if (await Deno.stat(join(out, named)).catch(() => undefined)) continue
    told.length = 0
    const started = performance.now()
    const done = await way.repaint(
      {
        session: { id: 'bench' } as Session,
        index: 9,
        file,
        seed: seed - 1,
        sheets,
        expression,
        ...(change && { change }),
      },
      () => {},
      new AbortController().signal,
    )
    const took = Math.round((performance.now() - started) / 1000)
    if ('skipped' in done) {
      console.log(`${file} ${label} seed ${seed}: skipped (${done.skipped}), ${took} s`)
      continue
    }
    await Deno.rename(join(out, done.faced.file), join(out, named))
    console.log(`${file} ${label} seed ${seed}: ${named}, ${took} s`)
    for (const t of told) console.log(`  told: ${t}`)
  }
}
