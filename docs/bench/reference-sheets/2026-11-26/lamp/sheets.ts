/**
 * Reference sheets with and without the style's lamp: the app's sheet prompt (`sheetPrompt`) for
 * the tavern Storyboard's Subjects, in the style that put an oil lamp beside the face (stage 2e,
 * stage 6: the Roleplay's, naming "the warm, flickering light of oil lamps"), by Qwen-Image 2.1 on a
 * ComfyUI at each seed; each checked as the app checks one (`lookOver`, `sheetFlaw`: `others` names
 * a lamp) and cut into its views (`cutSheet`), into `out`.
 *
 *   deno run -A sheets.ts <comfy address> <session folder> <out> <seeds>
 */
import { join } from 'node:path'
import { comfyuiImageGenerator } from '../../../../../server/images/comfyui/comfyui.ts'
import { comfyuiAskPicture } from '../../../../../server/heads/comfyui.ts'
import { findComfyModel } from '../../../../../server/images/comfyui/models.ts'
import { headFinder, sheetFlaw } from '../../../../../server/heads/heads.ts'
import { cutSheet, sheetPrompt } from '../../../../../server/sheets/sheets.ts'
import { DEFAULT_SETTINGS } from '../../../../../server/settings.ts'
import type { Sheet } from '../../../../../shared/session.ts'

const STYLE =
  'A moody, cinematic oil painting with heavy chiaroscuro, reminiscent of 18th-century Dutch masters, utilizing the warm, flickering light of oil lamps against deep, stormy shadows.'
const MODEL = 'qwen-image-2.1'

const [address, folder, out, seeds] = Deno.args
await Deno.mkdir(out, { recursive: true })
const session = JSON.parse(await Deno.readTextFile(join(folder, 'session.json')))
const generator = comfyuiImageGenerator({ address })
const heads = headFinder(comfyuiAskPicture({ address }))
const signal = new AbortController().signal
const steps = findComfyModel(MODEL)!.defaultSteps

for (const subject of session.look.subjects as { name: string; identity: string }[]) {
  const sheet = { subject: subject.name, identity: subject.identity } as Sheet
  const prompt = await sheetPrompt(sheet, STYLE)
  for (const seed of seeds.split(',').map(Number)) {
    const name = `${subject.name.toLowerCase()}-${seed}`
    const started = performance.now()
    const file = await generator.generate(
      {
        prompt,
        seed,
        settings: { ...DEFAULT_SETTINGS, imageModel: MODEL, steps },
        dir: out,
        name,
        size: { width: 1536, height: 640 },
      },
      signal,
    )
    const made = Math.round((performance.now() - started) / 100) / 10
    const look = await heads.lookOver({ dir: out, image: file, who: subject }, signal)
    await cutSheet(out, file)
    console.log(JSON.stringify({
      file,
      made,
      flaw: sheetFlaw(look, subject.name) ?? '',
      others: look.others,
    }))
  }
}
