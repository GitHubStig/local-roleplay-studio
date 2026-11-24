/**
 * The voice bench's lines, with the deliveries chosen for them, tagged as the app tags them
 * (`higgsText`): `deno run -A --config server/deno.json docs/bench/voices/cap/lines.ts`, from the
 * repo, writes `lines.json` beside this file for `render.py`.
 */
import { higgsText } from '../../../../server/voice/higgs.ts'

const HERE = new URL('./', import.meta.url)
const read = (f: string) => JSON.parse(Deno.readTextFileSync(new URL(`../${f}`, HERE)))
type Delivery = { pace?: string; sound?: string }
const norm = (d: Delivery) => ({
  pace: (['slow', 'fast'].includes(d.pace ?? '') ? d.pace : 'normal') as 'normal' | 'slow' | 'fast',
  sound: (['sigh', 'laughter', 'cough'].includes(d.sound ?? '') ? d.sound : 'none') as
    | 'none'
    | 'sigh'
    | 'laughter'
    | 'cough',
})
const out: object[] = []
const add = (id: string, text: string, d: Delivery, whisper = false) => {
  const n = norm(d)
  out.push({ id, plain: text, tagged: higgsText({ text, ...n, whisper }), ...n, whisper })
}
read('results.json').conversation.forEach((l: { line: string; delivery: Delivery }, i: number) =>
  add(`conv-${i}`, l.line, l.delivery)
)
const expression = read('expression/results.json')
expression.lines.forEach((l: { id: string; text: string; choice: Delivery }) =>
  add(`expr-${l.id}`, l.text, l.choice)
)
expression.thoughts.lines.forEach((l: { text: string; delivery: Delivery }, i: number) =>
  add(`thought-${i}`, l.text, l.delivery, true)
)
read('elara/results.json').lines.forEach((l: { id: string; text: string }) =>
  add(`elara-${l.id}`, l.text, {})
)
Deno.writeTextFileSync(new URL('lines.json', HERE), JSON.stringify(out, null, 1))
