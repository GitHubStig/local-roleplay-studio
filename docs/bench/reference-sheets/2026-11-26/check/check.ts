/**
 * Stage 6's bench (ADR 0045): reference sheets by several Image Models, then
 * checked by the Qwen3-VL in Qwen-Image 2.1, by the app's own code on a ComfyUI.
 *
 *   deno run -A check.ts render <comfy address> <out> <models> <seeds>
 *   deno run -A check.ts ask <comfy address> <out> <question file>...
 *   deno run -A check.ts look <comfy address, or "mflux"> <out> [sheet.png...]
 *
 * `render` makes each Subject's sheet (`SUBJECTS`) by each model at each seed, with the app's sheet
 * prompt (`prompts/sheets/sheet.md`), at 1536×640, as `<model>-<subject>-<seed>.png`, and prints
 * each one's time. `ask` asks each question (a Markdown file here, `{{who}}` the identity and
 * `{{name}}` the name) of every sheet in `out`, writing the replies to `out/answers-<question>.json`.
 * `look` checks the sheets given (else every one in `out`) as the app does (`lookOver`, `sheetFlaw`),
 * on the ComfyUI or this Mac's mflux, writing `out/looks-<where>.json`.
 */
import { basename, join } from 'node:path'
import { comfyuiImageGenerator } from '../../../../../server/images/comfyui/comfyui.ts'
import { comfyuiAskPicture } from '../../../../../server/heads/comfyui.ts'
import { findComfyModel } from '../../../../../server/images/comfyui/models.ts'
import { mfluxAskPicture } from '../../../../../server/heads/mflux.ts'
import { headFinder, sheetFlaw } from '../../../../../server/heads/heads.ts'
import { loadPrompt } from '../../../../../server/promptFiles.ts'
import { DEFAULT_SETTINGS } from '../../../../../server/settings.ts'

/** The tavern's (example-scenarios/tavern.md) Look, as a replay wrote it, and stage 0's lantern. */
const STYLE =
  "A moody, cinematic oil painting with heavy chiaroscuro, reminiscent of 18th-century Dutch masters, utilizing the warm, flickering light of oil lamps against deep, stormy shadows."
const SUBJECTS = [
  {
    slug: 'kael',
    name: 'Kael',
    identity:
      'Kael, a 42-year-old man with a lean build, slightly weathered skin, and piercing tired eyes with grey at the temples.',
  },
  {
    slug: 'elara',
    name: 'Elara',
    identity: 'Elara, a slender woman with pale cold-flushed skin and sharp calculating eyes.',
  },
  {
    slug: 'lantern',
    name: 'the Lantern of Vael',
    identity:
      'The Lantern of Vael, an ornate brass lantern with a domed cap, a ring handle, and panes of green glass etched with spiralling vines.',
  },
]

const [mode, address, out, ...rest] = Deno.args
await Deno.mkdir(out, { recursive: true })
const signal = new AbortController().signal

if (mode === 'render') {
  const [models, seeds] = rest
  const generator = comfyuiImageGenerator({ address })
  for (const model of models.split(',')) {
    const steps = findComfyModel(model)!.defaultSteps
    for (const subject of SUBJECTS) {
      const prompt = await loadPrompt('sheets/sheet', {
        identity: subject.identity,
        name: subject.name,
        style: STYLE,
      })
      for (const seed of seeds.split(',').map(Number)) {
        const name = `${model}-${subject.slug}-${seed}`
        const started = performance.now()
        const file = await generator.generate(
          {
            prompt,
            seed,
            settings: { ...DEFAULT_SETTINGS, imageModel: model, steps },
            dir: out,
            name,
            size: { width: 1536, height: 640 },
          },
          signal,
        )
        console.log(`${file} ${Math.round((performance.now() - started) / 100) / 10} s`)
      }
    }
  }
} else if (mode === 'ask') {
  const ask = comfyuiAskPicture({ address })
  const sheets = [...Deno.readDirSync(out)].map((e) => e.name).filter((n) => n.endsWith('.png'))
    .sort()
  for (const questionFile of rest) {
    const template = await Deno.readTextFile(questionFile)
    const answers: Record<string, { reply: string; seconds: number }> = {}
    for (const sheet of sheets) {
      const subject = SUBJECTS.find((s) => sheet.includes(`-${s.slug}-`))!
      const question = template.replace(/<!--[\s\S]*?-->\s*/g, '').trim()
        .replaceAll('{{who}}', subject.identity).replaceAll('{{name}}', subject.name)
      const started = performance.now()
      const reply = await ask({ image: sheet, dir: out }, question, signal)
      const seconds = Math.round((performance.now() - started) / 100) / 10
      answers[sheet] = { reply, seconds }
      console.log(`${basename(questionFile)} ${sheet} ${seconds} s: ${reply.replace(/\s+/g, ' ')}`)
    }
    const tag = basename(questionFile, '.md')
    await Deno.writeTextFile(join(out, `answers-${tag}.json`), JSON.stringify(answers, null, 1))
  }
}

if (mode === 'look') {
  const where = address === 'mflux' ? 'mflux' : 'comfyui'
  const finder = headFinder(where === 'mflux' ? mfluxAskPicture() : comfyuiAskPicture({ address }))
  const sheets = rest.length ? rest : [...Deno.readDirSync(out)].map((e) => e.name)
    .filter((n) => n.endsWith('.png')).sort()
  const looks: Record<string, unknown> = {}
  for (const sheet of sheets) {
    const subject = SUBJECTS.find((s) => sheet.includes(`-${s.slug}-`))!
    const who = { name: subject.name, identity: subject.identity }
    const started = performance.now()
    const look = await finder.lookOver({ image: sheet, dir: out, who }, signal)
    const seconds = Math.round((performance.now() - started) / 100) / 10
    const flaw = sheetFlaw(look, subject.name)
    looks[sheet] = { ...look, flaw, seconds }
    const turns = look.views.map((v) => v.facing ?? '?').join(', ')
    console.log(`${sheet} ${seconds} s: ${look.views.length} views (${turns}), ${look.heads} heads, writing "${look.writing}", others "${look.others}" → ${flaw ?? 'fit'}`)
  }
  await Deno.writeTextFile(join(out, `looks-${where}.json`), JSON.stringify(looks, null, 1))
}
