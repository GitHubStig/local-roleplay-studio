/** Stand-ins for SHARP and TripoSplat, for tests. */
import type { SceneMaker, SceneRequest } from './scene.ts'
import type { FigureMaker, FigureRequest } from './figure.ts'

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
