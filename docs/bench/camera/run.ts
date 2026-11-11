/**
 * The camera bench, Stage 1 (ADR 0038): what the Chain's own call does today with an
 * Action asking for a camera angle, a shot type or a target. Each Action is applied to one
 * hand-written bedroom prompt (two people), through the Chain's system and user messages as they
 * are checked out, on the Settings' Text Model and Limits, one call per Action and seed. Text only.
 *
 *   deno run -A docs/bench/camera/run.ts text <seeds, e.g. 1-8>
 *   deno run -A docs/bench/camera/run.ts targets <text-results.json>
 *
 * `targets` (Stage 2's first slice) renders each close-up Action two ways, on the PC's ComfyUI: the
 * Text Model's own reply from one seed of `text` (the scene cut down to what's in frame), and the
 * scene whole with only its camera sentence swapped for that reply's. Same seed and camera words,
 * so only the rest of the prompt differs. Renders go to `out/targets/`.
 *
 *   deno run -A docs/bench/camera/run.ts first <text-results.json>
 *
 * `first` renders the scene whole with its camera sentence moved to the front, for the close-ups and
 * a few angles (the angles in its place too), to `out/first/`.
 *
 *   deno run -A docs/bench/camera/run.ts edits <baseline.png>
 *   deno run -A docs/bench/camera/run.ts editcheck <baseline.png>
 *
 * `editcheck` looks into Qwen-Image 2.1 Edit on a whole picture (no painted area): the app's
 * ComfyUI workflow, without its int8 attention, and at 40 steps, on the PC; and mflux's on this
 * Mac at the same time. An ordinary edit and a camera move, to `out/editcheck/`.
 *
 * `edits` asks each edit model on the PC's ComfyUI for each camera move in `EDITS`, from one
 * baseline picture, to `out/edits/`.
 *
 * Writes `out/text-<model>.json` (every reply) and prints, per Action, which sentences changed
 * across the seeds and each camera sentence written. `out/` isn't committed.
 */
import { fileURLToPath } from 'node:url'
import { fileSettingsStore } from '../../../server/settings.ts'
import { chatTextModel } from '../../../server/textModel.ts'
import { connectionOf, textBackend } from '../../../server/text/backend.ts'
import { seededChat } from '../../../server/text/seeded.ts'
import { briefScenario } from '../../../server/scenario.ts'
import { sentences } from '../../../server/imagePrompt.ts'
import { setLimitsEnabled } from '../../../server/limits.ts'
import {
  ACTIONS,
  ANGLES,
  BEST_SOLO,
  BEST_TWO,
  BRIEF,
  EDITS,
  SCENE,
  SEQUENCES,
  SOLO,
  TARGETS,
  UNTRIED,
  WORDINGS,
} from './scene.ts'
import { MOVES as MOVES_FOR_WORDINGS } from './scene.ts'
import { comfyuiImageGenerator } from '../../../server/images/comfyui/comfyui.ts'
import {
  COMFYUI_MODELS,
  findComfyEditor,
  findComfyModel,
} from '../../../server/images/comfyui/models.ts'
import { loadModelWorkflow } from '../../../server/images/comfyui/workflow.ts'
import { comfyBase, fillWorkflow, runWorkflow } from '../../../server/comfyui/client.ts'
import { modelFiles, withUploads } from '../../../server/comfyui/files.ts'
import { mfluxImageGenerator } from '../../../server/images/mflux/mflux.ts'
import { pngSize } from '../../../server/png.ts'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const settings = await fileSettingsStore(new URL('../../../settings.json', import.meta.url)).load()
setLimitsEnabled(settings.limits)
/** The first Ollama in Settings: the Mac's own, where the Text Model is. */
const ollama = settings.backends.find((b) => b.kind === 'ollama')!
const scenario = briefScenario(BRIEF)
const ASPECTS = ['subject', 'pose', 'expression', 'camera', 'clothing', 'place', 'light', 'color', 'style']

/** Which of the nine sentences differ from `before`, by aspect; "count" if there aren't nine. */
function changed(before: string, after: string): string[] {
  const [a, b] = [sentences(before), sentences(after)]
  if (b.length !== 9) return [`${b.length} sentences`]
  return ASPECTS.filter((_, i) => a[i] !== b[i])
}

interface Run {
  action: string
  step?: number
  seed: number
  seconds: number
  outcome?: string
  narration?: string
  prompt?: string
  changed?: string[]
  camera?: string
  error?: string
}

async function apply(seed: number, prompt: string, action: string, label: string) {
  const chat = seededChat(
    textBackend(connectionOf(ollama), () => Promise.resolve('')).chat(settings.textModel, false),
    { session: `camera-${seed}-${label}`, seed },
  )
  const start = performance.now()
  try {
    const out = await chatTextModel(chat).write(
      { scenario, prompt, action },
      AbortSignal.timeout(180_000),
    )
    return {
      seconds: Math.round((performance.now() - start) / 100) / 10,
      outcome: out.outcome,
      narration: out.narration,
      prompt: out.prompt,
      changed: changed(prompt, out.prompt),
      camera: sentences(out.prompt)[3],
    }
  } catch (err) {
    return { seconds: (performance.now() - start) / 1000, error: (err as Error).message }
  }
}

async function text(seeds: number[]) {
  const runs: Run[] = []
  for (const seed of seeds) {
    for (const [i, action] of ACTIONS.entries()) {
      const run = { action, seed, ...await apply(seed, SCENE, action, `a${i}`) }
      runs.push(run)
      console.log(`seed ${seed} · ${action} → ${run.error ?? run.changed?.join(', ')}`)
    }
    for (const [i, steps] of SEQUENCES.entries()) {
      let prompt = SCENE
      for (const [step, action] of steps.entries()) {
        const run = { action, step, seed, ...await apply(seed, prompt, action, `s${i}-${step}`) }
        runs.push(run)
        console.log(`seed ${seed} · [${i}.${step}] ${action} → ${run.error ?? run.camera}`)
        if (!run.prompt) break
        prompt = run.prompt
      }
    }
  }
  await Deno.mkdir(here('out'), { recursive: true })
  const file = here(`out/text-${settings.textModel.replace(/[^\w.-]+/g, '_')}.json`)
  await Deno.writeTextFile(file, JSON.stringify({ model: settings.textModel, scene: SCENE, runs }, null, 2))
  console.log(`\nwrote ${file}`)
}

const MODELS = ['qwen-image-2.1', 'krea-2', 'moss-image']
const RENDER_SEED = 42

/** The scene with its camera sentence (the fourth) replaced. */
const withCamera = (camera: string) =>
  sentences(SCENE).map((s, i) => (i === 3 ? camera : s)).join(' ')

/** One seed's camera sentence for `action`, from a `text` run's results. */
async function cameraOf(file: string, seed = 1) {
  const { runs } = JSON.parse(await Deno.readTextFile(file)) as { runs: Run[] }
  return (action: string) => {
    const run = runs.find((r) => r.action === action && r.seed === seed && r.step === undefined)
    if (!run?.camera) throw new Error(`No reply for "${action}" at seed ${seed}`)
    return run.camera
  }
}

const comfyuiAddress = () => settings.backends.find((b) => b.kind === 'comfyui' && b.address)!.address

/** Renders `prompts` on each Image Model into `dir`, writing them down beside the pictures. */
async function renderAll(dir: string, prompts: { name: string; prompt: string }[], extra: object) {
  await Deno.mkdir(dir, { recursive: true })
  await Deno.writeTextFile(`${dir}/prompts.json`, JSON.stringify({ ...extra, prompts }, null, 2))
  const images = comfyuiImageGenerator({ address: comfyuiAddress() })
  for (const model of MODELS) {
    const steps = COMFYUI_MODELS.find((m) => m.id === model)!.defaultSteps
    const s = { ...settings, imageModel: model, steps }
    for (const { name, prompt } of prompts) {
      const start = performance.now()
      const out = await images.generate(
        { prompt, seed: RENDER_SEED, settings: s, dir, name: `${model}-${name}` },
        AbortSignal.timeout(600_000),
      )
      console.log(`${out}: ${((performance.now() - start) / 1000).toFixed(1)} s`)
    }
  }
}

/** The scene with its camera sentence first, the rest in order. */
const cameraFirst = (camera: string) => {
  const rest = sentences(SCENE).filter((_, i) => i !== 3)
  return [camera, ...rest].join(' ')
}

async function first(file: string) {
  const camera = await cameraOf(file)
  const prompts: { name: string; prompt: string }[] = []
  for (const [i, action] of TARGETS.entries()) {
    prompts.push({ name: `t${i + 1}-first`, prompt: cameraFirst(camera(action)) })
  }
  for (const [i, action] of ANGLES.entries()) {
    prompts.push({ name: `a${i + 1}-in-place`, prompt: withCamera(camera(action)) })
    prompts.push({ name: `a${i + 1}-first`, prompt: cameraFirst(camera(action)) })
  }
  await renderAll(here('out/first'), prompts, { targets: TARGETS, angles: ANGLES })
}

const EDIT_MODELS = [
  'qwen-image-2.1-edit',
  'qwen-image-2.1-turbo-edit',
  'flux3-klein-edit',
  'fibo-2.0-edit-turbo',
] as const

async function edits(baseline: string) {
  const dir = here('out/edits')
  await Deno.mkdir(dir, { recursive: true })
  await Deno.copyFile(baseline, `${dir}/baseline.png`)
  await Deno.writeTextFile(`${dir}/edits.json`, JSON.stringify({ baseline, edits: EDITS }, null, 2))
  const images = comfyuiImageGenerator({ address: comfyuiAddress() })
  for (const model of EDIT_MODELS) {
    for (const [i, instruction] of EDITS.entries()) {
      const start = performance.now()
      const out = await images.edit(
        { model, image: 'baseline.png', instruction, seed: RENDER_SEED, dir, name: `${model}-e${i + 1}` },
        AbortSignal.timeout(600_000),
      )
      console.log(`${out}: ${((performance.now() - start) / 1000).toFixed(1)} s`)
    }
  }
}

const CHECKS = [
  ['shirt', "Make the man's flannel shirt bright red; keep everything else as it is."],
  ['low', EDITS[0]],
] as const

/** Qwen-Image 2.1 Edit's whole-picture workflow as the app fills it, then changed for a variant. */
async function comfyEdit(
  dir: string,
  instruction: string,
  { attention, steps, cache, resolution, editModel = 'qwen-image-2.1-edit', ownSize }: {
    attention: boolean
    steps: number
    /** QwenImage21Cache's device; none leaves the model's own (auto). */
    cache?: 'auto' | 'gpu' | 'cpu' | 'off'
    /** The reference's pixel budget, 0 for its own size. */
    resolution?: number
    editModel?: string
    /** Start from an empty latent at the picture's own size, rather than the reference's. */
    ownSize?: boolean
  },
  name: string,
) {
  const base = comfyBase(comfyuiAddress())
  const editor = findComfyEditor(editModel)!
  const model = findComfyModel(editor.model)!
  const signal = AbortSignal.timeout(600_000)
  const files = await modelFiles(base, editor.files ?? model, signal)
  const image = await Deno.readFile(`${dir}/baseline.png`)
  const size = pngSize(image)
  return withUploads(base, [image], async ([uploaded]) => {
    const workflow = fillWorkflow(await loadModelWorkflow(editor.workflow), {
      ...files,
      image: `${uploaded} [temp]`,
      mask: '',
      prompt: instruction,
      seed: RENDER_SEED,
      steps,
      cfg: model.cfg ?? 1,
      width: size.width,
      height: size.height,
    })
    // As comfyui.ts does with nothing painted.
    for (const node of ['mask', 'encode', 'masked', 'composite']) delete workflow[node]
    workflow.sampler.inputs.latent_image = ['conditioning', 2]
    workflow.save.inputs.images = ['rgb', 0]
    if (!attention) {
      delete workflow.attention
      workflow.sampler.inputs.model = ['unet', 0]
    }
    if (cache) {
      workflow.cache = {
        class_type: 'QwenImage21Cache',
        inputs: { model: workflow.sampler.inputs.model, device: cache, dtype: 'default' },
      }
      workflow.sampler.inputs.model = ['cache', 0]
    }
    if (resolution !== undefined) workflow.conditioning.inputs.resolution = resolution
    if (ownSize) {
      workflow.canvas = {
        class_type: 'EmptyLatentImage',
        inputs: { width: size.width, height: size.height, batch_size: 1 },
      }
      workflow.sampler.inputs.latent_image = ['canvas', 0]
    }
    const start = performance.now()
    const { png } = await runWorkflow(base, workflow, signal, 15_000)
    await Deno.writeFile(`${dir}/${name}.png`, png!)
    console.log(`${name}: ${((performance.now() - start) / 1000).toFixed(1)} s`)
  })
}

async function editcheck(baseline: string) {
  const dir = here('out/editcheck')
  await Deno.mkdir(dir, { recursive: true })
  await Deno.copyFile(baseline, `${dir}/baseline.png`)
  await Deno.writeTextFile(`${dir}/checks.json`, JSON.stringify({ baseline, checks: CHECKS }, null, 2))
  const comfy = async () => {
    for (const [label, instruction] of CHECKS) {
      await comfyEdit(dir, instruction, { attention: true, steps: 25 }, `comfy-${label}-int8-25`)
      await comfyEdit(dir, instruction, { attention: false, steps: 25 }, `comfy-${label}-plain-25`)
      await comfyEdit(dir, instruction, { attention: true, steps: 40 }, `comfy-${label}-int8-40`)
      await comfyEdit(dir, instruction, { attention: false, steps: 40 }, `comfy-${label}-plain-40`)
    }
  }
  const mflux = async () => {
    const images = mfluxImageGenerator()
    for (const [label, instruction] of CHECKS) {
      const start = performance.now()
      await images.edit(
        {
          model: 'qwen-image-2.1-edit',
          image: 'baseline.png',
          instruction,
          seed: RENDER_SEED,
          quantize: settings.editQuantize,
          dir,
          name: `mflux-${label}`,
        },
        AbortSignal.timeout(1_200_000),
      )
      console.log(`mflux-${label}: ${((performance.now() - start) / 1000).toFixed(1)} s`)
    }
  }
  const results = await Promise.allSettled([comfy(), mflux()])
  for (const r of results) if (r.status === 'rejected') console.error(r.reason)
}

/** Further checks on ComfyUI's whole-picture edit: the cache off, a 1024 budget, the Turbo Edit. */
async function editcheck2() {
  const dir = here('out/editcheck')
  const shirt = CHECKS[0][1]
  if (Deno.args[1] === 'budget') {
    const budget = { attention: true, resolution: 1024 }
    await comfyEdit(dir, CHECKS[1][1], { ...budget, steps: 25 }, 'comfy-low-1024')
    await comfyEdit(dir, shirt, { ...budget, steps: 8, editModel: 'qwen-image-2.1-turbo-edit' }, 'comfy-shirt-turbo-1024')
    await comfyEdit(dir, CHECKS[1][1], { ...budget, steps: 8, editModel: 'qwen-image-2.1-turbo-edit' }, 'comfy-low-turbo-1024')
    return
  }
  if (Deno.args[1] === 'own') {
    const own = { attention: true, resolution: 1024, ownSize: true }
    await comfyEdit(dir, shirt, { ...own, steps: 25 }, 'comfy-shirt-1024-own')
    await comfyEdit(dir, CHECKS[1][1], { ...own, steps: 25 }, 'comfy-low-1024-own')
    await comfyEdit(dir, shirt, { ...own, steps: 8, editModel: 'qwen-image-2.1-turbo-edit' }, 'comfy-shirt-turbo-1024-own')
    await comfyEdit(dir, CHECKS[1][1], { ...own, steps: 8, editModel: 'qwen-image-2.1-turbo-edit' }, 'comfy-low-turbo-1024-own')
    return
  }
  await comfyEdit(dir, shirt, { attention: false, steps: 25, cache: 'off' }, 'comfy-shirt-cache-off')
  await comfyEdit(dir, shirt, { attention: false, steps: 25, resolution: 1024 }, 'comfy-shirt-res-1024')
  await comfyEdit(
    dir,
    shirt,
    { attention: true, steps: 8, editModel: 'qwen-image-2.1-turbo-edit' },
    'comfy-shirt-turbo',
  )
}

/** The app's own ComfyUI edit, as fixed: the whole picture, then a painted area (the man's shirt). */
async function appcheck() {
  const dir = here('out/editcheck')
  const images = comfyuiImageGenerator({ address: comfyuiAddress() })
  for (const model of ['qwen-image-2.1-edit', 'qwen-image-2.1-turbo-edit'] as const) {
    for (const mask of [undefined, 'mask-shirt.png']) {
      const name = `app-${model}-${mask ? 'masked' : 'whole'}`
      const start = performance.now()
      await images.edit(
        {
          model,
          image: 'baseline.png',
          ...(mask && { mask }),
          instruction: mask ? 'A bright red flannel shirt.' : CHECKS[0][1],
          seed: RENDER_SEED,
          dir,
          name,
        },
        AbortSignal.timeout(600_000),
      )
      console.log(`${name}: ${((performance.now() - start) / 1000).toFixed(1)} s`)
    }
  }
}

/** The moves in each of `WORDINGS`, on the Turbo Edit, from the baseline in `out/edits/`. */
async function wordings() {
  const dir = here('out/edits')
  const images = comfyuiImageGenerator({ address: comfyuiAddress() })
  const told: Record<string, string[]> = {}
  for (const [label, word] of Object.entries(WORDINGS)) {
    told[label] = MOVES_FOR_WORDINGS.map(word)
    for (const [i, instruction] of told[label].entries()) {
      const name = `turbo-${label}-e${i + 1}`
      const start = performance.now()
      await images.edit(
        { model: 'qwen-image-2.1-turbo-edit', image: 'baseline.png', instruction, seed: RENDER_SEED, dir, name },
        AbortSignal.timeout(600_000),
      )
      console.log(`${name}: ${((performance.now() - start) / 1000).toFixed(1)} s`)
    }
  }
  await Deno.writeTextFile(`${dir}/wordings.json`, JSON.stringify(told, null, 2))
}

/** Short words, fixes for overhead and Dutch, and moves in a row: each from a picture in `out/edits/`. */
const NEXT: { name: string; from: string; instruction: string }[] = [
  ...[
    'Low angle.',
    'High angle.',
    'Overhead shot.',
    'Dutch angle.',
    "Close-up on the woman's face.",
    "Close-up on Ana's face.",
    'Close-up on her hands.',
    "Close-up on the man's boots.",
    "Over the man's shoulder.",
  ].map((instruction, i) => ({ name: `short-${i + 1}`, from: 'baseline.png', instruction })),
  {
    name: 'fix-overhead',
    from: 'baseline.png',
    instruction:
      'Move the camera directly overhead, looking straight down at the floor, the bed and them; the woman stays sitting on the edge of the bed and the man leaning in the doorway. Keep everything else exactly as in the image.',
  },
  {
    name: 'fix-dutch-30',
    from: 'baseline.png',
    instruction:
      'Tilt the camera 30 degrees to the left, a Dutch angle: the walls, the door frame and the floor all slant across the picture. Keep everything else exactly as in the image.',
  },
  {
    name: 'fix-dutch-45',
    from: 'baseline.png',
    instruction:
      'Rotate the whole picture 45 degrees, as if the camera were tilted on its side: the door frame, the walls and the floor slant diagonally. Keep everything else exactly as in the image.',
  },
  {
    name: 'row-face-back',
    from: 'qwen-image-2.1-turbo-edit-e5.png',
    instruction:
      "Move the camera back across the room to show the whole bedroom: the woman sitting on the edge of the bed with a white shirt, and a man in a green flannel shirt leaning in the open doorway on the right, arms crossed.",
  },
  {
    name: 'row-low-overhead',
    from: 'qwen-image-2.1-turbo-edit-e1.png',
    instruction: 'Move the camera directly overhead, looking straight down at the floor, the bed and them. Keep everything else exactly as in the image.',
  },
]

async function next() {
  const dir = here('out/edits')
  const images = comfyuiImageGenerator({ address: comfyuiAddress() })
  for (const { name, from, instruction } of NEXT) {
    const start = performance.now()
    await images.edit(
      { model: 'qwen-image-2.1-turbo-edit', image: from, instruction, seed: RENDER_SEED, dir, name: `turbo-${name}` },
      AbortSignal.timeout(600_000),
    )
    console.log(`turbo-${name}: ${((performance.now() - start) / 1000).toFixed(1)} s`)
  }
  await Deno.writeTextFile(`${dir}/next.json`, JSON.stringify(NEXT, null, 2))
}

/** The wider check: the best wording per move on a second picture (one man, portrait) and on the bedroom at seed 43. */
async function wider() {
  const dir = here('out/wider')
  await Deno.mkdir(dir, { recursive: true })
  const images = comfyuiImageGenerator({ address: comfyuiAddress() })
  const steps = COMFYUI_MODELS.find((m) => m.id === 'qwen-image-2.1')!.defaultSteps
  const render = async (prompt: string, seed: number, size: string, name: string) => {
    const start = performance.now()
    const s = { ...settings, imageModel: 'qwen-image-2.1', steps, size }
    const out = await images.generate({ prompt, seed, settings: s, dir, name }, AbortSignal.timeout(600_000))
    console.log(`${out}: ${((performance.now() - start) / 1000).toFixed(1)} s`)
  }
  await render(SOLO, RENDER_SEED, 'portrait', 'solo-baseline')
  await render(SCENE, 43, 'landscape', 'two-43-baseline')
  const sets = [['solo', BEST_SOLO], ['two-43', BEST_TWO]] as const
  for (const [label, moves] of sets) {
    for (const [i, instruction] of moves.entries()) {
      const name = `${label}-e${i + 1}`
      const start = performance.now()
      await images.edit(
        { model: 'qwen-image-2.1-turbo-edit', image: `${label}-baseline.png`, instruction, seed: RENDER_SEED, dir, name },
        AbortSignal.timeout(600_000),
      )
      console.log(`${name}: ${((performance.now() - start) / 1000).toFixed(1)} s`)
    }
  }
  await Deno.writeTextFile(`${dir}/wider.json`, JSON.stringify({ solo: BEST_SOLO, two: BEST_TWO }, null, 2))
}

/**
 * Poses Roleplays often use, one clothed woman on a bed, each with the 8 moves. Their prompts are
 * read from `out/poses/poses.json` (`{ scenes: { <name>: prompt }, moves: [instruction] }`), which,
 * like the pictures, stays out of the repo.
 */
async function poses() {
  const dir = here('out/poses')
  const { scenes, moves } = JSON.parse(await Deno.readTextFile(`${dir}/poses.json`)) as {
    scenes: Record<string, string>
    moves: string[]
  }
  const images = comfyuiImageGenerator({ address: comfyuiAddress() })
  const steps = COMFYUI_MODELS.find((m) => m.id === 'qwen-image-2.1')!.defaultSteps
  const s = { ...settings, imageModel: 'qwen-image-2.1', steps, size: 'landscape' }
  for (const [name, prompt] of Object.entries(scenes)) {
    const start = performance.now()
    await images.generate({ prompt, seed: RENDER_SEED, settings: s, dir, name: `${name}-baseline` }, AbortSignal.timeout(600_000))
    console.log(`${name}-baseline: ${((performance.now() - start) / 1000).toFixed(1)} s`)
    for (const [i, instruction] of moves.entries()) {
      const t = performance.now()
      await images.edit(
        { model: 'qwen-image-2.1-turbo-edit', image: `${name}-baseline.png`, instruction, seed: RENDER_SEED, dir, name: `${name}-e${i + 1}` },
        AbortSignal.timeout(600_000),
      )
      console.log(`${name}-e${i + 1}: ${((performance.now() - t) / 1000).toFixed(1)} s`)
    }
  }
}

/** The moves not yet tried, on the bedroom (seed 42's render) and the kitchen. */
async function untried() {
  const dir = here('out/untried')
  await Deno.mkdir(dir, { recursive: true })
  await Deno.copyFile(here('out/edits/baseline.png'), `${dir}/two-baseline.png`)
  await Deno.copyFile(here('out/wider/solo-baseline.png'), `${dir}/solo-baseline.png`)
  const images = comfyuiImageGenerator({ address: comfyuiAddress() })
  for (const [label, moves] of Object.entries(UNTRIED)) {
    for (const [i, instruction] of moves.entries()) {
      const name = `${label}-u${i + 1}`
      const start = performance.now()
      await images.edit(
        { model: 'qwen-image-2.1-turbo-edit', image: `${label}-baseline.png`, instruction, seed: RENDER_SEED, dir, name },
        AbortSignal.timeout(600_000),
      )
      console.log(`${name}: ${((performance.now() - start) / 1000).toFixed(1)} s`)
    }
  }
  await Deno.writeTextFile(`${dir}/untried.json`, JSON.stringify(UNTRIED, null, 2))
}

/**
 * The Camera list's hardest moves on mflux's Qwen-Image 2.1 Turbo Edit (the Mac's default), in
 * the list's own wording, from the bedroom baseline the PC's edits started from.
 */
async function mfluxCamera() {
  const { CAMERA_MOVES } = await import('../../../web/src/cameraMoves.ts')
  const dir = here('out/mflux')
  await Deno.mkdir(dir, { recursive: true })
  await Deno.copyFile(here('out/edits/baseline.png'), `${dir}/baseline.png`)
  const images = mfluxImageGenerator()
  for (const label of ['Over the shoulder', 'Face', 'Low angle']) {
    const move = CAMERA_MOVES.find((m) => m.label === label)!
    const name = `turbo-${label.toLowerCase().replaceAll(' ', '-')}`
    const start = performance.now()
    await images.edit(
      {
        model: 'qwen-image-2.1-turbo-edit',
        image: 'baseline.png',
        instruction: move.instruction,
        seed: RENDER_SEED,
        quantize: settings.editQuantize,
        dir,
        name,
      },
      AbortSignal.timeout(1_200_000),
    )
    console.log(`${name}: ${((performance.now() - start) / 1000).toFixed(1)} s`)
  }
}

async function targets(file: string, seed = 1) {
  const { runs } = JSON.parse(await Deno.readTextFile(file)) as { runs: Run[] }
  const prompts: { name: string; prompt: string }[] = [{ name: '00-baseline', prompt: SCENE }]
  for (const [i, action] of TARGETS.entries()) {
    const run = runs.find((r) => r.action === action && r.seed === seed && r.step === undefined)
    if (!run?.prompt || !run.camera) throw new Error(`No reply for "${action}" at seed ${seed}`)
    const n = String(i + 1).padStart(2, '0')
    prompts.push({ name: `${n}-trimmed`, prompt: run.prompt })
    prompts.push({ name: `${n}-whole`, prompt: withCamera(run.camera) })
  }
  const dir = here('out/targets')
  await Deno.mkdir(dir, { recursive: true })
  await Deno.writeTextFile(
    `${dir}/prompts.json`,
    JSON.stringify({ seed, actions: TARGETS, prompts }, null, 2),
  )
  const comfyui = settings.backends.find((b) => b.kind === 'comfyui' && b.address)!
  const images = comfyuiImageGenerator({ address: comfyui.address })
  for (const model of MODELS) {
    const steps = COMFYUI_MODELS.find((m) => m.id === model)!.defaultSteps
    const s = { ...settings, imageModel: model, steps }
    for (const { name, prompt } of prompts) {
      const start = performance.now()
      const out = await images.generate(
        { prompt, seed: RENDER_SEED, settings: s, dir, name: `${model}-${name}` },
        AbortSignal.timeout(600_000),
      )
      console.log(`${out}: ${((performance.now() - start) / 1000).toFixed(1)} s`)
    }
  }
}

/** "1-8" or "1,3,5". */
const seedsOf = (arg = '1') =>
  arg.includes('-')
    ? Array.from({ length: +arg.split('-')[1] - +arg.split('-')[0] + 1 }, (_, i) => +arg.split('-')[0] + i)
    : arg.split(',').map(Number)

const [stage, arg] = Deno.args
if (stage === 'text') await text(seedsOf(arg))
else if (stage === 'targets') await targets(arg)
else if (stage === 'first') await first(arg)
else if (stage === 'edits') await edits(arg)
else if (stage === 'editcheck') await editcheck(arg)
else if (stage === 'editcheck2') await editcheck2()
else if (stage === 'appcheck') await appcheck()
else if (stage === 'wordings') await wordings()
else if (stage === 'next') await next()
else if (stage === 'wider') await wider()
else if (stage === 'poses') await poses()
else if (stage === 'untried') await untried()
else if (stage === 'mflux') await mfluxCamera()
else console.log('Usage: deno run -A docs/bench/camera/run.ts text <seeds> | targets <results.json>')
