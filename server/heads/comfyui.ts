/**
 * Asks Qwen-Image 2.1's Qwen3-VL on a ComfyUI about a picture (`workflows/ask.json`): its text encoder,
 * loaded as a CLIP, into ComfyUI's `TextGenerate`, greedy. 4.8–6.4 s a question on the PC's RTX
 * 4070, sent from the Mac (2026-11-25, stage 0); ComfyUI keeps the model loaded between them.
 */
import { join } from '@std/path'
import { comfyBase, fillWorkflow, loadWorkflow, runWorkflow } from '../comfyui/client.ts'
import { modelFiles, withUploads } from '../comfyui/files.ts'
import { QWEN_IMAGE_2_1_CLIP } from '../images/comfyui/models.ts'
import type { AskPicture } from './heads.ts'

const QWEN = { label: 'Qwen-Image 2.1', files: { clip: QWEN_IMAGE_2_1_CLIP } }

/** `checkEveryMs`: how often it checks the ComfyUI still answers while it works. */
export function comfyuiAskPicture(
  opts: { address: string; checkEveryMs?: number },
): AskPicture {
  const base = comfyBase(opts.address)
  return async (req, questions, signal) => {
    const picture = await Deno.readFile(join(req.dir, req.image))
    const files = await modelFiles(base, QWEN, signal)
    const workflow = await loadWorkflow(new URL('./workflows/ask.json', import.meta.url))
    // One upload, a prompt per question: ComfyUI keeps the model loaded between them.
    return await withUploads(base, [picture], async ([image]) => {
      const replies: string[] = []
      for (const question of questions) {
        const { outputs } = await runWorkflow(
          base,
          fillWorkflow(workflow, {
            ...files,
            // Uploaded to its temp folder, which LoadImage must be told.
            image: `${image} [temp]`,
            question,
          }),
          signal,
          opts.checkEveryMs ?? 15_000,
        )
        const text = (outputs.answer?.text as unknown[] | undefined)?.[0]
        if (typeof text !== 'string') throw new Error("Qwen-Image 2.1 didn't answer on ComfyUI")
        replies.push(text)
      }
      return replies
    })
  }
}
