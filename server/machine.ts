/**
 * Which Backend a job runs on (ADR 0022), and so which machine: jobs take turns per machine (ADR
 * 0020), and the Text Model is unloaded for a heavy job only when they share one (ADR 0013). A
 * machine is named by a Backend's address; `undefined` is this machine.
 */
import {
  type Backend,
  BACKEND_WORK,
  backendAddress,
  HERE,
  imageKindOf,
  inTurn,
  pickBackend,
  type Work,
} from './backends.ts'
import { type EditModel, editModelOn } from './images/editModels.ts'
import { findImageModel, type ImageBackendKind } from './images/imageModels.ts'
import type { Availabilities } from './features.ts'
import type { JobKind } from './jobs.ts'
import type { SessionSettings, Settings } from './settings.ts'

/**
 * A heavy job, as the render queue is given it: a render by its Image Model, an edit by its edit
 * model, an upscale or a voice. Any other (SHARP, a figure) runs here. A render or an edit may say
 * which kind of backend it would rather run on (`on`: the Session's choice, or the Edit dialog's),
 * a preference, not a must: a Session shared with a machine that hasn't that kind still renders.
 */
export type HeavyJob =
  | { kind: 'render'; model: string; on?: ImageBackendKind }
  | { kind: 'edit'; model: EditModel; on?: ImageBackendKind }
  | { kind: 'upscale' | 'voice' }
  /** A clip (`video/`): only a ComfyUI makes them, the one pictures go to if they go to one. */
  | { kind: 'video' }

/** An edit as the render queue is given it: by its edit model, on the kind it would rather. */
export const editJob = (model: EditModel, on?: ImageBackendKind): HeavyJob => ({
  kind: 'edit',
  model,
  ...(on && { on }),
})

/** What this machine's own Backend can run, as found at startup (`features.ts`). */
export type Here = Pick<Availabilities, 'images' | 'upscale' | 'edits' | 'voices'>

const WORK_OF: Record<Exclude<HeavyJob['kind'], 'video'>, Work> = {
  render: 'images',
  edit: 'edits',
  upscale: 'upscale',
  voice: 'voices',
}

/**
 * Whether `backend` can run `job`: this machine only what it has; a render where its Image Model
 * is, an edit on its edit model's kind of Backend.
 */
export function canRun(backend: Backend, job: HeavyJob, here: Here): boolean {
  if (job.kind === 'video') return backend.kind === 'comfyui'
  const work = WORK_OF[job.kind]
  if (!BACKEND_WORK[backend.kind].includes(work)) return false
  if (backend.kind === 'here' && !here[work as keyof Here].available) return false
  if (job.kind === 'render') {
    const kind = imageKindOf(backend)
    return !!kind && !!findImageModel(kind, job.model)
  }
  if (job.kind === 'edit') {
    const kind = imageKindOf(backend)
    return !!kind && editModelOn(job.model, kind)
  }
  return true
}

/**
 * The Backend a heavy job goes to as Settings are `now` (`pickBackend`): of the kind it would
 * rather run on, if one can run it, else any; any other job, this machine's. Undefined when no
 * Backend can run it.
 */
export function backendOf(
  job: HeavyJob | undefined,
  now: Pick<Settings, 'backends' | 'runOn'>,
  here: Here,
): Backend | undefined {
  if (!job) return HERE
  const preferred = now.runOn[job.kind === 'video' ? 'images' : WORK_OF[job.kind]]
  const can = (b: Backend) => canRun(b, job, here)
  const on = 'on' in job ? job.on : undefined
  return (on && pickBackend(now.backends, preferred, (b) => imageKindOf(b) === on && can(b))) ||
    pickBackend(now.backends, preferred, can)
}

/**
 * The Backend that runs the Text Model `model`: the first text Backend, Settings' preferred one
 * first, that lists it (`listed`, which may fail for one that doesn't answer); the preferred one if
 * none does, so its own error says why.
 */
export async function textBackendFor(
  now: Pick<Settings, 'backends' | 'runOn'>,
  model: string,
  listed: (backend: Backend) => Promise<string[]>,
): Promise<Backend | undefined> {
  const text = inTurn(now.backends, now.runOn.text).filter((b) =>
    BACKEND_WORK[b.kind].includes('text')
  )
  for (const backend of text) {
    if ((await listed(backend).catch((): string[] => [])).includes(model)) return backend
  }
  return text[0]
}

const hostOf = (address: string) => {
  try {
    return new URL(address).hostname.replace(/^\[|\]$/g, '').toLowerCase()
  } catch {
    return address.toLowerCase()
  }
}

/** This machine's own names and addresses, as far as Deno can tell (`--allow-sys`). */
function ownNames(): Set<string> {
  const names = new Set<string>()
  try {
    const host = Deno.hostname().toLowerCase()
    names.add(host).add(`${host.replace(/\.local$/, '')}.local`)
  } catch { /* no permission: loopback only */ }
  try {
    for (const { address } of Deno.networkInterfaces()) names.add(address.toLowerCase())
  } catch { /* no permission: loopback only */ }
  return names
}

/** Whether `address` is this machine: loopback, or one of its own names and addresses. */
export function isThisMachine(address: string | undefined, own: Set<string> = ownNames()): boolean {
  if (!address) return true
  const host = hostOf(address)
  return host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) ||
    host === '::1' || host === '0.0.0.0' || own.has(host)
}

/** Whether two addresses are the same machine: both this one, or the same host. */
export function sameMachine(
  a: string | undefined,
  b: string | undefined,
  own: Set<string> = ownNames(),
): boolean {
  if (isThisMachine(a, own) && isThisMachine(b, own)) return true
  return !!a && !!b && hostOf(a) === hostOf(b)
}

/**
 * The machine a job takes turns on, as a key: `here` for this one, its host for another. Jobs on
 * different machines run side by side; on one, they take turns.
 */
export const machineKey = (address: string | undefined, own: Set<string> = ownNames()): string =>
  isThisMachine(address, own) ? 'here' : hostOf(address!)

/** The machine a Backend is on, as a key (`machineKey`); this one for none. */
export const machineOf = (backend: Backend | undefined, own?: Set<string>): string =>
  machineKey(backend && backendAddress(backend), own)

/**
 * Where a Session's queued job runs: a picture with the Text Model (it writes an Image Prompt), a
 * render by the Session's Image Model, an edit by its edit model (the one it was told, or Settings'
 * now), an upscale, a voice designed or a line spoken, each as Settings send it now; a clip on a
 * ComfyUI; 3D and the style scores here.
 */
export function jobBackend(
  kind: JobKind,
  session: Pick<SessionSettings, 'imageModel' | 'imageBackend'>,
  now: Settings,
  here: Here,
  opts: { editModel?: EditModel; editBackend?: ImageBackendKind; text?: Backend },
): Backend | undefined {
  switch (kind) {
    case 'picture':
      return opts.text
    case 'render': {
      const on = session.imageBackend
      return backendOf({ kind: 'render', model: session.imageModel, ...(on && { on }) }, now, here)
    }
    case 'edit':
      return backendOf(editJob(opts.editModel ?? now.editModel, opts.editBackend), now, here)
    case 'upscale':
      return backendOf({ kind: 'upscale' }, now, here)
    case 'voice':
    case 'speak':
    case 'speak-thought':
      return backendOf({ kind: 'voice' }, now, here)
    case 'clip':
      return backendOf({ kind: 'video' }, now, here)
    default:
      return HERE
  }
}
