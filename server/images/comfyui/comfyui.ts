import { join } from '@std/path'
import { type ImageGenerator, UPSCALED_EDGE } from '../imageGenerator.ts'
import { COMFYUI_URL } from '../imageModels.ts'
import { SIZE_PRESETS } from '../../settings.ts'
import { type ComfyModel, findComfyModel, findComfyUpscaler } from './models.ts'
import { fillWorkflow, loadWorkflow, pickFiles, type Workflow } from './workflow.ts'

/**
 * Pictures from a ComfyUI server, through its HTTP and WebSocket API only (never its folders, so it
 * can be Comfy Desktop, the portable build or another machine, on macOS or Windows): the model's
 * workflow is queued (`POST /prompt`) and followed over `/ws`, which brings its steps and then the
 * picture itself (the workflow ends in `SaveImageWebsocket`, which ships with ComfyUI), saved into
 * the Session's folder. ComfyUI keeps nothing: it writes no file, and the prompt is deleted from
 * its history afterwards. Cancel interrupts just that prompt. The address is the Session's
 * `imageBaseUrl`, or ComfyUI's default.
 *
 * Afterwards ComfyUI is asked to unload its models (`POST /free`), as an mflux process frees its
 * memory when it ends: kept loaded (about 16 GB for Qwen-Image 2.1), they'd crowd out the Text
 * Model, and on a 12 GB card push it off the GPU.
 */
export function comfyuiImageGenerator(opts: {
  /**
   * ComfyUI's address for upscaling ('' for its default): Settings' now, as the Upscaler is read
   * when upscaling. A render uses its Session's.
   */
  upscaleUrl?: () => Promise<string>
  /** How often a running job checks that ComfyUI still answers (`watchAlive`); shorter in tests. */
  checkEveryMs?: number
} = {}): ImageGenerator {
  const checkEveryMs = opts.checkEveryMs ?? 15_000
  return {
    async generate(req, signal, onProgress) {
      const base = baseUrl(req.settings.imageBaseUrl)
      const model = findComfyModel(req.settings.imageModel)
      if (!model) throw new Error(`ComfyUI has no Image Model "${req.settings.imageModel}" here`)
      const size = SIZE_PRESETS.find((p) => p.id === req.settings.size) ?? SIZE_PRESETS[0]

      const workflow = fillWorkflow(await loadWorkflow(model.id), {
        ...await modelFiles(base, model, signal),
        prompt: req.prompt,
        seed: req.seed,
        steps: req.settings.steps,
        width: size.width,
        height: size.height,
      })
      const file = `${req.name}.png`
      await Deno.writeFile(
        join(req.dir, file),
        await runWorkflow(base, workflow, signal, checkEveryMs, onProgress),
      )
      return file
    },

    /**
     * SeedVR2, built into ComfyUI. The picture has to reach ComfyUI as a file: it goes to its temp
     * folder, and afterwards a blank 1×1 picture is written over it, so ComfyUI keeps an empty
     * stub, which it clears from temp when it next starts (it has no API to delete an upload).
     */
    async upscale(req, signal, onProgress) {
      const base = baseUrl(await opts.upscaleUrl?.() ?? '')
      const upscaler = findComfyUpscaler(req.model)
      if (!upscaler) throw new Error(`ComfyUI has no upscaler "${req.model}" here`)
      const files = await modelFiles(base, upscaler, signal)
      const name = `rpg-${crypto.randomUUID()}.png`
      const uploaded = await upload(base, name, await Deno.readFile(join(req.dir, req.image)))
      try {
        const workflow = fillWorkflow(await loadWorkflow('seedvr2'), {
          ...files,
          image: `${uploaded} [temp]`,
          edge: UPSCALED_EDGE,
          seed: req.seed,
        })
        const file = `${req.name}.png`
        await Deno.writeFile(
          join(req.dir, file),
          await runWorkflow(base, workflow, signal, checkEveryMs, onProgress),
        )
        return file
      } finally {
        await upload(base, uploaded, BLANK_PNG).catch(() => {})
      }
    },
  }
}

const baseUrl = (address: string) => (address || COMFYUI_URL).replace(/\/+$/, '')

/**
 * Queues a filled workflow and follows it over the WebSocket to the picture it sends back. Cancel
 * interrupts just this prompt; afterwards its prompt leaves ComfyUI's history, and ComfyUI unloads
 * its models. If ComfyUI stops answering meanwhile (`watchAlive`), the job fails rather than
 * waiting for good.
 */
async function runWorkflow(
  base: string,
  workflow: Workflow,
  signal: AbortSignal,
  checkEveryMs: number,
  onProgress?: (step: number, total: number) => void,
): Promise<Uint8Array> {
  const clientId = crypto.randomUUID()
  const socket = await openSocket(base, clientId, signal)
  let promptId: string | undefined
  try {
    const queued = await fetch(`${base}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      signal,
    })
    const body = await queued.json().catch(() => ({}))
    if (!queued.ok) throw new Error(`ComfyUI refused the workflow: ${refusal(body)}`)
    promptId = body.prompt_id as string
    const cancel = () => {
      // Running: interrupt just this prompt. Still queued: take it out of the queue.
      post(base, '/interrupt', { prompt_id: promptId })
      post(base, '/queue', { delete: [promptId] })
    }
    signal.addEventListener('abort', cancel, { once: true })
    const stalled = new AbortController()
    const watchdog = watchAlive(base, checkEveryMs, () =>
      stalled.abort(
        new Error('ComfyUI stopped answering (it may have crashed): restart it, then try again'),
      ))
    try {
      return await finished(socket, promptId, AbortSignal.any([signal, stalled.signal]), onProgress)
    } finally {
      clearInterval(watchdog)
      signal.removeEventListener('abort', cancel)
    }
  } finally {
    // Not awaited, so Cancel returns at once.
    cleanUp(base, socket, promptId, signal.aborted)
  }
}

/**
 * After a prompt: takes it out of ComfyUI's history, closes the WebSocket and unloads ComfyUI's
 * models. An interrupted prompt is written to the history only once ComfyUI has stopped it, so
 * after a Cancel this waits for that first (up to 10 s); deleted any sooner, it stayed there
 * (checked on Windows, 2026-10-07).
 */
async function cleanUp(
  base: string,
  socket: WebSocket,
  promptId: string | undefined,
  cancelled: boolean,
) {
  if (promptId && cancelled) await stopped(socket, promptId, 10_000)
  socket.close()
  if (promptId) post(base, '/history', { delete: [promptId] })
  post(base, '/free', { unload_models: true, free_memory: true })
}

/**
 * Resolves when ComfyUI has finished with the prompt, the socket closes, or `ms` pass. Finished
 * means `executing` with no node: ComfyUI sends it after writing the prompt's history
 * (`main.py`'s `prompt_worker`), whereas `execution_interrupted` comes before.
 */
function stopped(socket: WebSocket, promptId: string, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    const done = () => (clearTimeout(timer), resolve())
    socket.onclose = done
    socket.onmessage = (e) => {
      if (typeof e.data !== 'string') return
      const { type, data } = JSON.parse(e.data) as {
        type: string
        data?: { prompt_id?: string; node?: string | null }
      }
      if (type === 'executing' && data?.prompt_id === promptId && data.node === null) done()
    }
  })
}

/**
 * Asks ComfyUI every `everyMs` whether it still answers (`GET /system_stats`, which it does while
 * it renders), and calls `onDead` after two checks in a row get no answer: a ComfyUI that crashed
 * can keep its port open and the WebSocket with it, so nothing else would end the wait (seen on
 * Windows, 2026-10-07: a "Fatal Python error: Aborted" while loading a model). Returns the timer.
 */
function watchAlive(
  base: string,
  everyMs: number,
  onDead: () => void,
): ReturnType<typeof setInterval> {
  let misses = 0
  let checking = false
  return setInterval(async () => {
    if (checking) return
    checking = true
    const answered = await fetch(`${base}/system_stats`, { signal: AbortSignal.timeout(everyMs) })
      .then((r) => (r.body?.cancel(), r.ok), () => false)
    checking = false
    misses = answered ? 0 : misses + 1
    if (misses >= 2) onDead()
  }, everyMs)
}

/**
 * Sends a picture to ComfyUI's temp folder under `name`, replacing any there, and returns the
 * name ComfyUI gave it.
 */
async function upload(base: string, name: string, png: Uint8Array<ArrayBuffer>): Promise<string> {
  const form = new FormData()
  form.append('image', new Blob([png], { type: 'image/png' }), name)
  form.append('type', 'temp')
  form.append('overwrite', 'true')
  const res = await fetch(`${base}/upload/image`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`ComfyUI didn't take the picture to upscale: HTTP ${res.status}`)
  return (await res.json()).name
}

/** A 1×1 transparent PNG, written over an uploaded picture once it's been used. */
const BLANK_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

/** The files a model's loaders use on this ComfyUI (`pickFiles`); throws naming any missing. */
async function modelFiles(
  base: string,
  model: Pick<ComfyModel, 'label' | 'files'>,
  signal: AbortSignal,
) {
  const installed = new Map<string, string[]>()
  for (const folder of new Set(Object.values(model.files).map((f) => f.folder))) {
    installed.set(folder, await getJson(base, `/models/${folder}`, signal))
  }
  return pickFiles(model, (folder) => installed.get(folder) ?? [])
}

/** Whether ComfyUI answers at an address, and can run an Image Model there: for Settings. */
export type ComfyStatus =
  | { up: true; version: string; device: string; ready: boolean; missing?: string }
  | { up: false; error: string }

/**
 * Asks the ComfyUI at `baseUrl` ('' for its default) what it is (`GET /system_stats`), and whether it
 * has the files of the Image Model and the upscaler that will run there (either may be left out).
 * Never throws: what's wrong is in the answer.
 */
export async function comfyuiStatus(
  baseUrl: string,
  uses: { imageModel?: string; upscaler?: string },
): Promise<ComfyStatus> {
  const base = (baseUrl || COMFYUI_URL).replace(/\/+$/, '')
  const signal = AbortSignal.timeout(5000)
  let stats: { system?: { comfyui_version?: string }; devices?: { name?: string }[] }
  try {
    stats = await getJson(base, '/system_stats', signal)
  } catch (err) {
    return { up: false, error: (err as Error).message }
  }
  const up = {
    up: true as const,
    version: stats.system?.comfyui_version ?? '?',
    device: stats.devices?.[0]?.name ?? '?',
  }
  const missing: string[] = []
  const check = async (
    id: string | undefined,
    find: (id: string) => Pick<ComfyModel, 'label' | 'files'> | undefined,
    what: string,
  ) => {
    if (id === undefined) return
    const model = find(id)
    if (!model) return missing.push(`ComfyUI has no ${what} "${id}" here`)
    await modelFiles(base, model, signal).catch((err) => missing.push((err as Error).message))
  }
  await check(uses.imageModel, findComfyModel, 'Image Model')
  await check(uses.upscaler, findComfyUpscaler, 'upscaler')
  return missing.length
    ? { ...up, ready: false, missing: missing.join('; ') }
    : { ...up, ready: true }
}

async function getJson(base: string, path: string, signal: AbortSignal) {
  let res: Response
  try {
    res = await fetch(`${base}${path}`, { signal })
  } catch (err) {
    if (signal.aborted) throw err
    throw new Error(`Couldn't reach ComfyUI at ${base}: is it running? (${(err as Error).message})`)
  }
  if (!res.ok) throw new Error(`ComfyUI ${path}: HTTP ${res.status}`)
  return res.json()
}

/** Sends a request without waiting for its answer beyond 10 s (a crashed ComfyUI may never give one). */
const post = (base: string, path: string, body: object) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  }).then((r) => r.body?.cancel()).catch(() => {})

/** ComfyUI's reason for refusing a workflow: its error, or the first node's. */
function refusal(body: { error?: { message?: string }; node_errors?: Record<string, unknown> }) {
  const node = Object.values(body.node_errors ?? {})[0] as
    | { class_type?: string; errors?: { message?: string; details?: string }[] }
    | undefined
  const detail = node?.errors?.[0]
  return [
    body.error?.message,
    node && `${node.class_type}: ${detail?.message} ${detail?.details ?? ''}`,
  ]
    .filter(Boolean).join(' · ') || 'unknown error'
}

function openSocket(base: string, clientId: string, signal: AbortSignal): Promise<WebSocket> {
  const url = `${base.replace(/^http/, 'ws')}/ws?clientId=${encodeURIComponent(clientId)}`
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const fail = () => reject(new Error(`Couldn't reach ComfyUI at ${base}: is it running?`))
    // Cancelled while connecting. Once open, the socket stays until `cleanUp`, which after a
    // Cancel still needs it to hear the prompt stop.
    const abort = () => {
      socket.close()
      reject(signal.reason)
    }
    socket.onopen = () => {
      socket.onerror = null
      signal.removeEventListener('abort', abort)
      resolve(socket)
    }
    socket.onerror = fail
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** A binary WebSocket message: an image (type 1), as a PNG (format 2), then its bytes. */
const IMAGE_MESSAGE = 1
const PNG = 2

/**
 * Resolves with the picture when ComfyUI reports the prompt done; rejects with its error, or the
 * player's Cancel. Passes on the sampler's steps (`progress` events with a `max` above 1). The
 * picture is the last PNG image message: sampler previews, when ComfyUI sends them, come before it
 * and as JPEGs.
 */
function finished(
  socket: WebSocket,
  promptId: string,
  signal: AbortSignal,
  onProgress?: (step: number, total: number) => void,
): Promise<Uint8Array> {
  let png: Uint8Array | undefined
  socket.binaryType = 'arraybuffer'
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    socket.onclose = () => reject(new Error('Lost the connection to ComfyUI mid-render'))
    socket.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        const header = new DataView(e.data)
        if (header.getUint32(0) === IMAGE_MESSAGE && header.getUint32(4) === PNG) {
          png = new Uint8Array(e.data, 8)
        }
        return
      }
      const { type, data } = JSON.parse(e.data) as { type: string; data?: Record<string, unknown> }
      if (data?.prompt_id !== promptId) return
      if (type === 'progress' && Number(data.max) > 1) {
        onProgress?.(Number(data.value), Number(data.max))
      } else if (type === 'execution_success') {
        if (png) resolve(png)
        else reject(new Error('ComfyUI finished without sending the picture'))
      } else if (type === 'execution_error') {
        reject(new Error(`ComfyUI: ${data.node_type ?? ''} ${data.exception_message ?? ''}`.trim()))
      } else if (type === 'execution_interrupted') {
        reject(signal.reason ?? new Error('ComfyUI was interrupted'))
      }
    }
  })
}
