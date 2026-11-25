/**
 * Asks Qwen-Image 2.1's Qwen3-VL on mflux about a picture: `python/heads/make.py`, run once per
 * question through uv (about 21 s with Python starting and the model loading, 7–9 s of it the
 * answer, MLX's peak 10.8 GB: 2026-11-25, the Mac). Only its text encoder is read.
 */
import { join } from '@std/path'
import { findImageModel } from '../images/imageModels.ts'
import { MFLUX_MODELS } from '../images/mflux/models.ts'
import { runModelScript } from '../modelScript.ts'
import { pythonScript, SHIPPED_PYTHON, type ToolOptions } from '../pythonTools.ts'
import type { Quantize } from '../../shared/settings.ts'
import type { AskPicture } from './heads.ts'

/** The weights it reads: mflux's Qwen-Image 2.1, as a render or an edit loads them. */
const QWEN = MFLUX_MODELS.find((m) => m.id === 'qwen-image-2.1')!

/** `quantize`, Settings' `editQuantize` as each question is asked (8-bit by default). */
export function mfluxAskPicture(
  opts: ToolOptions & { quantize?: () => Promise<Quantize> } = {},
): AskPicture {
  if (!findImageModel('mflux', QWEN.id)) throw new Error('mflux has no Qwen-Image 2.1')
  return async (req, question, signal) => {
    const quantize = opts.quantize ? await opts.quantize() : 8
    const result = await runModelScript(
      opts.command ??
        ['uv', 'run', '--quiet', pythonScript(opts.python ?? SHIPPED_PYTHON, 'heads')],
      [
        '--model',
        QWEN.model,
        '--base-model',
        QWEN.baseModel!,
        '--image',
        join(req.dir, req.image),
        '--ask',
        question,
        '--quantize',
        String(quantize ?? 0),
      ],
      'Qwen-Image 2.1',
      signal,
    )
    if (typeof result.reply !== 'string') throw new Error("Qwen-Image 2.1 didn't answer")
    return result.reply
  }
}
