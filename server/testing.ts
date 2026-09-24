import type { ImageGenerator } from './imageGenerator.ts'
import { parseScenario, type ScenarioLibrary } from './scenario.ts'
import type { TextModel, TurnText } from './textModel.ts'

export const scenarioText = `---
title: Test Shoot
description: A short test.
imagePrefix: studio photo
setup: { location: a studio }
sceneSchema:
  type: object
  properties:
    pose: { type: string }
  required: [pose]
---
## System
Rules.
## Opening
Start.
`

export const testScenario = parseScenario('test', scenarioText)

export const scenarioLibrary: ScenarioLibrary = {
  list: () =>
    Promise.resolve({
      scenarios: [testScenario],
      errors: [{ file: 'broken.md', message: 'title must be a non-empty string' }],
    }),
  get: (id) => Promise.resolve(id === 'test' ? testScenario : undefined),
}

/** A Text Model that replies from a queue; an Error in the queue is thrown instead. */
export function scriptedTextModel(replies: (TurnText | Error)[]): TextModel & { calls: number } {
  const model = {
    calls: 0,
    write(_req: unknown, signal: AbortSignal) {
      model.calls++
      signal.throwIfAborted()
      const next = replies.shift()
      if (!next) return Promise.reject(new Error('no scripted reply left'))
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
    },
  }
  return model
}

export const reply = (pose: string, extra: Partial<TurnText> = {}): TurnText => ({
  narration: `Now ${pose}.`,
  declined: false,
  scene: { pose },
  ...extra,
})

/** Writes a tiny file per image; can be told to fail or to wait for an abort. */
export function fakeImageGenerator(
  opts: { fail?: boolean; hang?: boolean } = {},
): ImageGenerator & { prompts: string[] } {
  const gen = {
    prompts: [] as string[],
    async generate(req: { prompt: string; dir: string; name: string }, signal: AbortSignal) {
      gen.prompts.push(req.prompt)
      signal.throwIfAborted()
      if (opts.fail) throw new Error('mflux crashed')
      if (opts.hang) {
        await new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        )
      }
      const file = `${req.name}.png`
      await Deno.writeTextFile(`${req.dir}/${file}`, req.prompt)
      return file
    },
  }
  return gen
}

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await Deno.makeTempDir()
  try {
    return await fn(dir)
  } finally {
    await Deno.remove(dir, { recursive: true })
  }
}
