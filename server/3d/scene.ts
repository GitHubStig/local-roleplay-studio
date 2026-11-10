/**
 * 3D scenes made from pictures with Apple's SHARP (`python/sharp/make.py`): one picture becomes about 1.2
 * million Gaussian splats, written as a `.ply` the web app shows in 3D. Run once per scene, like
 * mflux once per picture, so the memory it peaks at (~15 GB) is freed when it's done.
 */
import { fromFileUrl } from '@std/path'
import { runModelScript } from '../modelScript.ts'

export interface SceneRequest {
  /** The picture to make the scene from. */
  image: string
  /** Where to write the `.ply`. */
  out: string
}

/** What came out: how many splats, how far away the scene's subjects are, and the camera. */
export interface SceneResult {
  splats: number
  /** The depth to orbit around: a quarter of the splats are nearer. */
  pivot: number
  /** The camera SHARP assumed (a 30 mm lens): vertical field of view in degrees, width / height. */
  fov: number
  aspect: number
}

export interface SceneMaker {
  /** `onDownload` is called with true while SHARP downloads (its first use), then false. */
  make(
    req: SceneRequest,
    signal: AbortSignal,
    onDownload?: (downloading: boolean) => void,
  ): Promise<SceneResult>
}

const SCRIPT = fromFileUrl(new URL('../../python/sharp/make.py', import.meta.url))

/** Runs SHARP once per scene; `command` replaces `uv run python/sharp/make.py` in tests. */
export function sharpSceneMaker(opts: { command?: string[] } = {}): SceneMaker {
  return {
    async make(req, signal, onDownload) {
      const result = await runModelScript(
        opts.command ?? ['uv', 'run', '--quiet', SCRIPT],
        ['--image', req.image, '--out', req.out],
        'SHARP',
        signal,
        onDownload,
      )
      return {
        splats: result.splats as number,
        pivot: result.pivot as number,
        fov: result.fov as number,
        aspect: result.aspect as number,
      }
    },
  }
}
