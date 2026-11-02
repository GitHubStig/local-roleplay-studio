import { loadPrompt } from '../promptFiles.ts'
import { maskBoxes } from './maskBoxes.ts'

/**
 * What an edit model is told: the instruction as typed, or its own prompt (`prompts/images/`),
 * which names each painted area as a box (FLUX.3's layout table: `[ymin, xmin, ymax, xmax]` in
 * thousandths), and with nothing painted its `-whole` prompt. The same on mflux and ComfyUI.
 */
export async function editPrompt(
  prompt: string | undefined,
  instruction: string,
  mask?: Uint8Array<ArrayBuffer>,
): Promise<string> {
  if (!prompt) return instruction
  const boxes = mask ? await maskBoxes(mask) : []
  if (!boxes.length) return loadPrompt(`images/${prompt}-whole`, { instruction })
  const ids = boxes.map((_, i) => `obj_${i + 1}`)
  const thousandths = (n: number) => Math.round(n * 1000)
  return loadPrompt(`images/${prompt}`, {
    instruction,
    areas: new Intl.ListFormat('en').format(ids.map((id) => `<${id}>`)),
    layout: JSON.stringify(boxes.map((box, i) => ({
      id: ids[i],
      bbox: [box.top, box.left, box.bottom, box.right].map(thousandths),
      desc: instruction,
    }))),
  })
}
