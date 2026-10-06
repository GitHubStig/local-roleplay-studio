/**
 * People as full 3D figures, back included, made from a picture of them with TripoSplat
 * (`python/triposplat/make.py`): it cuts the person out and builds them in Gaussian splats. Run once per
 * figure, like SHARP once per scene, so the memory it peaks at (~11 GB) is freed when it's done.
 */
import { fromFileUrl } from '@std/path'
import { runModelScript } from './scene.ts'

/** A person as a full 3D figure of Gaussian splats, back included (TripoSplat or LiTo). */
export interface Figure {
  /** `.ply` file inside the Session directory. */
  file: string
  splats: number
  /** The picture it was made from: the Frame's upscale if it had one, else its picture. */
  from: string
  /** Seconds it waited for a render, and took to make. */
  timings: { queued?: number; figure: number }
}

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

const SCRIPT = fromFileUrl(new URL('../../python/triposplat/make.py', import.meta.url))

const LITO = fromFileUrl(new URL('../../python/lito/make.py', import.meta.url))

/** Runs Apple's LiTo once per figure (`python/lito/make.py`); `command` replaces it in tests. */
export function litoFigureMaker(opts: { command?: string[] } = {}): FigureMaker {
  return {
    async make(req, signal, onDownload) {
      const result = await runModelScript(
        opts.command ?? ['uv', 'run', '--quiet', LITO],
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
export function tripoFigureMaker(opts: { command?: string[] } = {}): FigureMaker {
  return {
    async make(req, signal, onDownload) {
      const result = await runModelScript(
        opts.command ?? ['uv', 'run', '--quiet', SCRIPT],
        ['--image', req.image, '--out', req.out],
        'TripoSplat',
        signal,
        onDownload,
      )
      return { splats: result.splats as number }
    },
  }
}

/** Stands in for TripoSplat in tests: writes a tiny file naming the picture. */
export function fakeFigureMaker(opts: { fail?: string } = {}): FigureMaker & {
  made: FigureRequest[]
} {
  const made: FigureRequest[] = []
  return {
    made,
    async make(req, signal) {
      signal.throwIfAborted()
      made.push(req)
      if (opts.fail) throw new Error(opts.fail)
      await Deno.writeTextFile(req.out, `ply fake figure of ${req.image}`)
      return { splats: 8 }
    },
  }
}
