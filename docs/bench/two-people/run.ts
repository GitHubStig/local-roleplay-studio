/**
 * The two-people bench (README.md): plans the tavern scenario as a Storyboard in one of three
 * prompt shapes, then renders its two-person Frames on two Image Models.
 *
 *   deno run -A docs/bench/two-people/run.ts plan <variant> <seed>
 *   deno run -A docs/bench/two-people/run.ts render
 *
 * Variants: `today` and `wording` run the app's own plan call (`server/prompts/storyboard/plan.md`
 * as it is checked out); `people` runs this folder's `people-plan.md`, a block per person. Plans go
 * to `prompts/`, renders to `out/` (not committed).
 */
import { fromFileUrl, join } from 'jsr:@std/path@^1.1.6'
import { dirScenarioLibrary } from '../../../server/scenario.ts'
import { fileSettingsStore, type Settings } from '../../../server/settings.ts'
import { chatTextModel } from '../../../server/textModel.ts'
import { connectionOf, textBackend } from '../../../server/text/backend.ts'
import { seededChat } from '../../../server/text/seeded.ts'
import { composePrompt, matchShown } from '../../../server/look.ts'
import { comfyuiImageGenerator } from '../../../server/images/comfyui/comfyui.ts'
import { COMFYUI_MODELS } from '../../../server/images/comfyui/models.ts'
import { asSentences, earlierSubjects } from '../../../server/imagePrompt.ts'

const here = (path: string) => fromFileUrl(new URL(path, import.meta.url))
const FRAMES = 6
const RENDER_SEED = 42
const MODELS = ['qwen-image-2.1', 'flux3-klein']
/** Two-person Frames rendered from each plan. */
const PER_PLAN = 2

const settings = await fileSettingsStore(new URL('../../../settings.json', import.meta.url))
  .load()
const scenario = (await dirScenarioLibrary(new URL('../../../scenarios/', import.meta.url))
  .get('tavern'))!

interface Planned {
  variant: string
  seed: number
  model: string
  seconds: number
  look: unknown
  beats: string[]
  frames: { shown: string[]; prompt: string; parts?: unknown }[]
}

const chatFor = (seed: number) =>
  seededChat(
    textBackend(connectionOf(settings), () => Promise.resolve('')).chat(settings.textModel, false),
    { session: `bench-${seed}`, seed },
  )

async function planToday(variant: string, seed: number): Promise<Planned> {
  const start = performance.now()
  const plan = await chatTextModel(chatFor(seed)).planStoryboard(
    { scenario, frameCount: FRAMES },
    AbortSignal.timeout(600_000),
  )
  return {
    variant,
    seed,
    model: settings.textModel,
    seconds: Math.round((performance.now() - start) / 100) / 10,
    look: plan.look,
    beats: plan.beats,
    frames: plan.frames.map((f) => {
      const shown = matchShown(plan.look.people, f.shown)
      return { shown, prompt: composePrompt(plan.look, f.body, shown) }
    }),
  }
}

// --- The `people` shape: a block per person, one interaction sentence, then the scene.

interface PersonLook {
  name: string
  handle: string
  identity: string
  outfit: string
}
interface PersonInFrame {
  name: string
  where: string
  pose: string
  expression: string
  clothing: string
}
interface PeopleFrame {
  people: PersonInFrame[]
  interaction: string
  camera: string
  environment: string
  lighting: string
  color: string
}

const str = (description: string) => ({ type: 'string', description })
function peopleSchema(frameCount: number) {
  return {
    type: 'object',
    properties: {
      look: {
        type: 'object',
        properties: {
          people: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: str('their name'),
                handle: str('a short visual handle, e.g. "the scarred man"'),
                identity: str('who they are, starting with the name and the handle'),
                outfit: str('what they wear at the start'),
              },
              required: ['name', 'handle', 'identity', 'outfit'],
            },
          },
          style: str('the art style and medium'),
        },
        required: ['people', 'style'],
      },
      beats: { type: 'array', items: { type: 'string' }, minItems: frameCount, maxItems: frameCount },
      frames: {
        type: 'array',
        minItems: frameCount,
        maxItems: frameCount,
        items: {
          type: 'object',
          properties: {
            camera: str('one sentence: the angle, lens and framing'),
            people: {
              type: 'array',
              maxItems: 3,
              items: {
                type: 'object',
                properties: {
                  name: str('as in the Look'),
                  where: str('one sentence: where they are in the picture'),
                  pose: str('one sentence: their body, limbs and hands'),
                  expression: str('one sentence: their face and where they look'),
                  clothing: str('one sentence: what they wear now'),
                },
                required: ['name', 'where', 'pose', 'expression', 'clothing'],
              },
            },
            interaction: str('one sentence: who does what to whom; empty with fewer than two'),
            environment: str('one sentence: the place, backdrop and props'),
            lighting: str('one sentence: the light sources, direction and quality'),
            color: str('one sentence: the palette and grading'),
          },
          required: ['camera', 'people', 'interaction', 'environment', 'lighting', 'color'],
        },
      },
    },
    required: ['look', 'beats', 'frames'],
  }
}

/** A `people` Frame's Image Prompt: each person's block, the interaction, the scene, the style. */
export function peoplePrompt(look: { people: PersonLook[]; style: string }, f: PeopleFrame) {
  // The model writes a name as it likes ("Kael, the scarred man"): matched by name or handle.
  const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').trim()
  const blocks = f.people.slice(0, 3).map((p) => {
    const asked = ` ${words(p.name)} `
    const person = look.people.find((l) =>
      asked.includes(` ${words(l.name)} `) || asked.includes(` ${words(l.handle)} `)
    )
    return [person?.identity ?? '', p.where, p.pose, p.expression, p.clothing]
      .map(asSentences).filter(Boolean).join(' ')
  })
  return [
    ...blocks,
    f.people.length > 1 ? f.interaction : '',
    f.camera,
    f.environment,
    f.lighting,
    f.color,
    look.style,
  ].map(asSentences).filter(Boolean).join(' ')
}

async function planPeople(seed: number): Promise<Planned> {
  const system = await Deno.readTextFile(here('./people-plan.md'))
  const user = [
    `Plan exactly ${FRAMES} Frames for this Brief. Answer with one JSON object holding all three`,
    `parts, in order: "look", then "beats" (${FRAMES} lines), then "frames" (${FRAMES} Frames).`,
    '',
    'The Brief and its facts:',
    '',
    JSON.stringify(scenario.setup, null, 2),
    '',
    scenario.openingPrompt,
  ].join('\n')
  const start = performance.now()
  const { content } = await chatFor(seed).stream({
    messages: [
      { role: 'system', content: system.replace(/^<!--[\s\S]*?-->\s*/, '') },
      { role: 'user', content: user },
    ],
    schema: peopleSchema(FRAMES),
    maxTokens: 12000,
    signal: AbortSignal.timeout(600_000),
  })
  const plan = JSON.parse(content) as {
    look: { people: PersonLook[]; style: string }
    beats: string[]
    frames: PeopleFrame[]
  }
  return {
    variant: 'people',
    seed,
    model: settings.textModel,
    seconds: Math.round((performance.now() - start) / 100) / 10,
    look: plan.look,
    beats: plan.beats,
    frames: plan.frames.map((f) => ({
      shown: f.people.map((p) => p.name),
      prompt: peoplePrompt(plan.look, f),
      parts: f,
    })),
  }
}

// --- A Chain: the Opening, then Actions that take the traveller out and back and bring a third
// person in. Each Frame's whole prompt is the paragraph the Text Model rewrote.

const ACTIONS = [
  'Kael slides the letter across the bar to her.',
  'She reads it, frowning, while he leans in close to watch her face.',
  'The traveller steps back out into the rain to think, leaving Kael alone.',
  'Close-up of Kael pouring himself a drink with shaking hands.',
  'She comes back in, soaked through, and sits down at the bar across from him.',
  'A hooded stranger appears on the balcony above them, watching.',
  'Kael draws a knife and points it up at the stranger while she ducks behind the bar.',
]
/** Frames with two or three people, rendered: the Opening, 2, 3, 6, 7 and 8. */
const CHAIN_RENDERED = [0, 1, 2, 5, 6, 7]

async function chain(variant: string, seed: number): Promise<Planned> {
  const model = chatTextModel(chatFor(seed))
  const frames: Planned['frames'] = []
  let prompt: string | null = null
  const start = performance.now()
  for (const action of [null, ...ACTIONS]) {
    // As the app does: earlier subject sentences, when the variant is `remember`.
    const earlier = variant === 'remember' && prompt
      ? earlierSubjects(frames.map((f) => f.prompt), prompt)
      : []
    const text = await model.write(
      { scenario, prompt, action, earlier },
      AbortSignal.timeout(300_000),
    )
    if (text.outcome === 'done') prompt = text.prompt
    const i = frames.length
    frames.push({
      shown: CHAIN_RENDERED.includes(i) ? ['', ''] : [],
      prompt: prompt!,
      parts: { action, outcome: text.outcome, narration: text.narration },
    })
  }
  return {
    variant: `chain-${variant}`,
    seed,
    model: settings.textModel,
    seconds: Math.round((performance.now() - start) / 100) / 10,
    look: null,
    beats: [],
    frames,
  }
}

// --- Rendering.

/** Renders the plans and Chains whose file name starts with `only`, or all of them. */
async function render(only = '') {
  const files = [...Deno.readDirSync(here('./prompts/'))].map((e) => e.name).filter((n) =>
    n.endsWith('.json') && n.startsWith(only)
  ).sort()
  const images = comfyuiImageGenerator()
  const dir = here('./out/')
  await Deno.mkdir(dir, { recursive: true })
  for (const model of MODELS) {
    const steps = COMFYUI_MODELS.find((m) => m.id === model)!.defaultSteps
    const s: Settings = { ...settings, imageModel: model, steps, size: 'landscape' }
    for (const file of files) {
      const plan = JSON.parse(await Deno.readTextFile(join(here('./prompts/'), file))) as Planned
      if (plan.variant === 'people') {
        // Put together again from the parts, as `peoplePrompt` may have changed since.
        const look = plan.look as { people: PersonLook[]; style: string }
        for (const f of plan.frames) f.prompt = peoplePrompt(look, f.parts as PeopleFrame)
      }
      // A Chain's chosen Frames all; a plan's first few with two or more people.
      const pairs = plan.frames.map((f, i) => ({ ...f, i })).filter((f) => f.shown.length >= 2)
        .slice(0, plan.variant.startsWith('chain') ? undefined : PER_PLAN)
      for (const f of pairs) {
        const name = `${file.replace('.json', '')}-f${f.i + 1}-${model}`
        if ([...Deno.readDirSync(dir)].some((e) => e.name.startsWith(name + '.'))) continue
        const start = performance.now()
        const out = await images.generate(
          { prompt: f.prompt, seed: RENDER_SEED, settings: s, dir, name },
          AbortSignal.timeout(600_000),
        )
        console.log(`${out}: ${((performance.now() - start) / 1000).toFixed(1)} s`)
      }
    }
  }
}

const [command, variant, seedArg] = Deno.args
if (command === 'plan' || command === 'chain') {
  const seed = Number(seedArg)
  const planned = command === 'chain'
    ? await chain(variant, seed)
    : variant === 'people'
    ? await planPeople(seed)
    : await planToday(variant, seed)
  await Deno.mkdir(here('./prompts/'), { recursive: true })
  await Deno.writeTextFile(
    here(`./prompts/${planned.variant}-${seed}.json`),
    JSON.stringify(planned, null, 2) + '\n',
  )
  const pairs = planned.frames.filter((f) => f.shown.length >= 2).length
  console.log(`${planned.variant} ${seed}: ${planned.seconds} s, ${pairs} Frames to render`)
} else if (command === 'render') {
  await render(variant)
} else {
  console.error(
    'Usage: run.ts plan <today|wording|people> <seed> | chain <today|each|remember> <seed> | render',
  )
  Deno.exit(1)
}
