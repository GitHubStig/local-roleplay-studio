/**
 * People as full 3D figures, back included, made from a picture of them with TripoSplat
 * (`python/triposplat/make.py`): it cuts the person out and builds them in Gaussian splats. Run once per
 * figure, like SHARP once per scene, so the memory it peaks at (~11 GB) is freed when it's done.
 */
import { pythonScript, SHIPPED_PYTHON, type ToolOptions } from '../pythonTools.ts'
import { runModelScript } from '../modelScript.ts'

export interface FigureRequest {
  /** The picture of the person. */
  image: string
  /** Where to write the `.ply`. */
  out: string
}

export interface FigureMaker {
  /** `onDownload` is called with true while TripoSplat downloads (its first use), then false. */
  make(
    req: FigureRequest,
    signal: AbortSignal,
    onDownload?: (downloading: boolean) => void,
  ): Promise<{ splats: number }>
}

/** Runs Apple's LiTo once per figure (`python/lito/make.py`); `command` replaces it in tests. */
export function litoFigureMaker(opts: ToolOptions = {}): FigureMaker {
  return {
    async make(req, signal, onDownload) {
      const result = await runModelScript(
        opts.command ??
          ['uv', 'run', '--quiet', pythonScript(opts.python ?? SHIPPED_PYTHON, 'lito')],
        ['--image', req.image, '--out', req.out],
        'LiTo',
        signal,
        onDownload,
      )
      return { splats: result.splats as number }
    },
  }
}

/** Runs TripoSplat once per figure; `command` replaces `uv run python/triposplat/make.py` in tests. */
export function tripoFigureMaker(opts: ToolOptions = {}): FigureMaker {
  return {
    async make(req, signal, onDownload) {
      const result = await runModelScript(
        opts.command ??
          ['uv', 'run', '--quiet', pythonScript(opts.python ?? SHIPPED_PYTHON, 'triposplat')],
        ['--image', req.image, '--out', req.out],
        'TripoSplat',
        signal,
        onDownload,
      )
      return { splats: result.splats as number }
    },
  }
}
