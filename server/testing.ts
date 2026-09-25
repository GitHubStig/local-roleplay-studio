import type { ImageGenerator } from './imageGenerator.ts'
import { parseScenario, type ScenarioLibrary } from './scenario.ts'
import type { ImagePrompt } from './imagePrompt.ts'
import type { FrameText, TextModel } from './textModel.ts'

export const scenarioText = `---
title: Test Shoot
description: A short test.
setup: { location: a studio }
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

/** An Image Prompt that differs from others only in its pose. */
export const promptWith = (pose: string): ImagePrompt =>
  `A person, ${pose}, calm, eye level, running gear, in a studio, softbox light, neutral tones, photo.`

/**
 * A Text Model that replies from a queue; an Error in the queue is thrown instead. It says an
 * Action names a real person when it mentions `realPeople`.
 */
export function scriptedTextModel(
  replies: (FrameText | Error)[],
  realPeople: string[] = [],
): TextModel & { calls: number; personChecks: string[] } {
  const model = {
    calls: 0,
    personChecks: [] as string[],
    write(_req: unknown, signal: AbortSignal, onThinking?: (chunk: string) => void) {
      model.calls++
      signal.throwIfAborted()
      const next = replies.shift()
      if (!next) return Promise.reject(new Error('no scripted reply left'))
      if (next instanceof Error) return Promise.reject(next)
      // Streams any scripted reasoning word by word, as Ollama does.
      for (const word of next.thinking?.split(/(?<= )/) ?? []) onThinking?.(word)
      return Promise.resolve(next)
    },
    namesRealPerson(action: string) {
      model.personChecks.push(action)
      return Promise.resolve(realPeople.some((name) => action.includes(name)))
    },
  }
  return model
}

export const reply = (pose: string, extra: Partial<FrameText> = {}): FrameText => ({
  outcome: 'done',
  narration: `Pose: ${pose}.`,
  prompt: promptWith(pose),
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
