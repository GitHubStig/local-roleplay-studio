/**
 * 3D scenes made from pictures with Apple's SHARP (`scene/make.py`): one picture becomes about 1.2
 * million Gaussian splats, written as a `.ply` the web app shows in 3D. Run once per scene, like
 * mflux once per picture, so the memory it peaks at (~15 GB) is freed when it's done.
 */
import { fromFileUrl } from '@std/path'
import { track } from './children.ts'

/** A Frame's picture as a 3D scene of Gaussian splats (SHARP). */
export interface Scene {
  /** `.ply` file inside the Session directory. */
  file: string
  /** The picture it was made from: the Frame's `image`, or its `upscaled`. */
  from: string
  splats: number
  /** The depth to orbit around, so the people near the front stay in view. */
  pivot: number
  /** The camera it was made for: vertical field of view in degrees, and width / height. */
  fov: number
  aspect: number
  /** Seconds it waited for a render and took. */
  timings: { queued?: number; scene: number }
}

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

/**
 * Runs one of the 3D scripts (`uv run <script> --image … --out …`) to completion and returns the
 * JSON on its last line. `onDownload` hears the script's "Downloading <name>" and "Downloaded"
 * lines, printed while it fetches its weights the first time.
 */
export async function runModelScript(
  command: string[],
  args: string[],
  name: string,
  signal: AbortSignal,
  onDownload?: (downloading: boolean) => void,
): Promise<Record<string, unknown>> {
  const [cmd, ...rest] = command
  const child = track(
    new Deno.Command(cmd, {
      args: [...rest, ...args],
      stdout: 'piped',
      stderr: 'piped',
      signal,
    }).spawn(),
  )
  const stdout = new Response(child.stdout).text()
  let stderr = ''
  for await (const chunk of child.stderr.pipeThrough(new TextDecoderStream())) {
    stderr = (stderr + chunk).slice(-8000)
    for (const line of chunk.split(/[\r\n]+/)) {
      if (line === `Downloading ${name}`) onDownload?.(true)
      if (line === 'Downloaded') onDownload?.(false)
    }
  }
  const { success } = await child.status
  signal.throwIfAborted()
  if (!success) {
    const why = stderr.trim().split(/[\r\n]+/).at(-1) || 'no output'
    throw new Error(`${name} failed (needs uv; see README): ${why}`)
  }
  return JSON.parse((await stdout).trim().split('\n').at(-1)!)
}

const SCRIPT = fromFileUrl(new URL('../scene/make.py', import.meta.url))

/** Runs SHARP once per scene; `command` replaces `uv run scene/make.py` in tests. */
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

/** Stands in for SHARP in tests: writes a tiny file naming the picture. */
export function fakeSceneMaker(opts: { fail?: string } = {}): SceneMaker & {
  made: SceneRequest[]
} {
  const made: SceneRequest[] = []
  return {
    made,
    async make(req, signal) {
      signal.throwIfAborted()
      made.push(req)
      if (opts.fail) throw new Error(opts.fail)
      await Deno.writeTextFile(req.out, `ply fake scene of ${req.image}`)
      return { splats: 4, pivot: 1.5, fov: 51.3, aspect: 1 }
    },
  }
}
