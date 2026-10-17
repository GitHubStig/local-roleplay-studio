import type { ImageGenerator, OnPreview, OnProgress } from './images/imageGenerator.ts'
import { parseScenario, type ScenarioLibrary } from './scenario.ts'
import type { ImagePrompt } from './imagePrompt.ts'
import type { Settings } from './settings.ts'
import type {
  FrameRequest,
  FrameText,
  PlanHandlers,
  StoryboardEdit,
  StoryboardPlan,
  StoryboardWrite,
  StoryboardWriteRequest,
  TextModel,
} from './textModel.ts'

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
  `A person, ${pose}, calm, eye level, a wool coat, in a tavern, lamplight, warm tones, oil painting.`

/** Scripted Storyboard replies for `scriptedTextModel`. */
export interface Scripts {
  plans?: (StoryboardPlan | Error)[]
  /** Each Frame's Write; with none scripted, a Frame is written as `writtenBody` says. */
  writes?: (StoryboardWrite | Error)[]
  edits?: (StoryboardEdit | Error)[]
}

/** The sentences the scripted Text Model writes for Frame `index` when none are scripted. */
export const writtenBody = (index: number) =>
  `Pose ${index + 1}. Calm. Wide shot. Kit. Court. Light. Grey.`

/**
 * A Text Model that replies from queues; an Error in a queue is thrown instead. It says an Action
 * names a real person when it mentions one of `realPeople`.
 */
export function scriptedTextModel(
  replies: (FrameText | Error)[],
  realPeople: string[] = [],
  scripts: Scripts = {},
): TextModel & {
  calls: number
  personChecks: string[]
  requests: FrameRequest[]
  writeRequests: StoryboardWriteRequest[]
} {
  const next = <T>(queue: (T | Error)[] | undefined, what: string): Promise<T> => {
    const item = queue?.shift()
    if (!item) return Promise.reject(new Error(`no scripted ${what} left`))
    return item instanceof Error ? Promise.reject(item) : Promise.resolve(item)
  }
  const model = {
    calls: 0,
    personChecks: [] as string[],
    /** Each Chain Frame asked for, in order. */
    requests: [] as FrameRequest[],
    /** Each Storyboard Frame written, in order. */
    writeRequests: [] as StoryboardWriteRequest[],
    write(req: FrameRequest, signal: AbortSignal, onThinking?: (chunk: string) => void) {
      model.calls++
      model.requests.push(req)
      signal.throwIfAborted()
      const item = replies[0]
      // Streams any scripted reasoning word by word, as Ollama does.
      if (item && !(item instanceof Error)) {
        for (const word of item.thinking?.split(/(?<= )/) ?? []) onThinking?.(word)
      }
      return next(replies, 'reply')
    },
    namesRealPerson(action: string) {
      model.personChecks.push(action)
      return Promise.resolve(realPeople.some((name) => action.includes(name)))
    },
    async planStoryboard(_req: unknown, signal: AbortSignal, on: PlanHandlers = {}) {
      model.calls++
      signal.throwIfAborted()
      const plan = await next(scripts.plans, 'plan')
      on.look?.(plan.look)
      plan.beats.forEach((beat, i) => on.beat?.(i, beat))
      return plan
    },
    writeStoryboardFrame(req: StoryboardWriteRequest, signal: AbortSignal) {
      model.calls++
      model.writeRequests.push(req)
      signal.throwIfAborted()
      if (scripts.writes === undefined) return Promise.resolve({ body: writtenBody(req.index) })
      return next(scripts.writes, 'write')
    },
    editStoryboardFrame(_req: unknown, signal: AbortSignal) {
      model.calls++
      signal.throwIfAborted()
      return next(scripts.edits, 'edit')
    },
  }
  return model
}

/** A scripted Storyboard plan with `n` Frames. */
export const planOf = (n: number, extra: Partial<StoryboardPlan> = {}): StoryboardPlan => ({
  look: {
    subjects: [{ name: 'Ace', identity: 'Ace, a tall adult athlete.' }],
    style: 'A pencil sketch.',
  },
  beats: Array.from({ length: n }, (_, i) => ({ beat: `Beat ${i + 1}`, shown: ['Ace'] })),
  ...extra,
})

export const reply = (pose: string, extra: Partial<FrameText> = {}): FrameText => ({
  outcome: 'done',
  narration: `Pose: ${pose}.`,
  prompt: promptWith(pose),
  ...extra,
})

/** Writes a tiny file per image; can be told to fail or to wait for an abort. */
export function fakeImageGenerator(
  opts: { fail?: boolean; hang?: boolean } = {},
): ImageGenerator & {
  prompts: string[]
  settings: Settings[]
  upscaled: string[]
  upscalers: string[]
} {
  const gen = {
    prompts: [] as string[],
    /** The Settings each image was rendered with. */
    settings: [] as Settings[],
    /** The images asked to be upscaled. */
    upscaled: [] as string[],
    /** The upscaler model each was upscaled with. */
    upscalers: [] as string[],
    async generate(
      req: { prompt: string; settings: Settings; dir: string; name: string },
      signal: AbortSignal,
      _onProgress?: OnProgress,
      _onDownload?: () => void,
      onPreview?: OnPreview,
    ) {
      gen.prompts.push(req.prompt)
      gen.settings.push(req.settings)
      signal.throwIfAborted()
      if (opts.fail) throw new Error('mflux crashed')
      if (opts.hang) {
        // A render in progress shows the picture forming, as ComfyUI's does.
        onPreview?.(new Uint8Array([255, 216, 255]))
        await new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        )
      }
      const file = `${req.name}.png`
      await Deno.writeTextFile(`${req.dir}/${file}`, req.prompt)
      return file
    },
    async upscale(
      req: { model: string; image: string; dir: string; name: string },
      signal: AbortSignal,
    ) {
      gen.upscaled.push(req.image)
      gen.upscalers.push(req.model)
      signal.throwIfAborted()
      if (opts.fail) throw new Error('mflux crashed')
      if (opts.hang) {
        await new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        )
      }
      const file = `${req.name}.png`
      await Deno.copyFile(`${req.dir}/${req.image}`, `${req.dir}/${file}`)
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
