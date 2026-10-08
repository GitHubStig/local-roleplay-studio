/** ComfyUI's own default address. */
export const COMFYUI_URL = 'http://127.0.0.1:8188'

/**
 * Talking to a ComfyUI server, for pictures and voices alike: through its HTTP and WebSocket API
 * only (never its folders, so it can be Comfy Desktop, the portable build or another machine, on
 * macOS or Windows). A workflow is queued (`POST /prompt`) and followed over `/ws` to its end.
 * ComfyUI keeps as little as it can: the prompt is deleted from its history afterwards, and its
 * models are unloaded (`POST /free`), as a process frees its memory when it ends: kept loaded
 * (about 16 GB for Qwen-Image 2.1, 10 GB for Higgs TTS 3), they'd crowd out the Text Model, and on
 * a 12 GB card push it off the GPU.
 */

/** A workflow in ComfyUI's API format: node id → its class and inputs. */
export type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>

/** A file ComfyUI wrote (an output node's `ui`), as `/view` serves it. */
export interface ComfyFile {
  filename: string
  subfolder: string
  type: string
}

/** What a finished workflow gave back. */
export interface WorkflowResult {
  /** The last PNG sent over the WebSocket (`SaveImageWebsocket`). */
  png?: Uint8Array
  /** What each output node reported (`executed`), by node id: e.g. `{ audio: [ComfyFile] }`. */
  outputs: Record<string, Record<string, unknown>>
}

/** ComfyUI's address: Settings' or a Session's, or its default ('' for that). */
export const comfyBase = (address: string) => (address || COMFYUI_URL).replace(/\/+$/, '')

/** Reads a workflow (a JSON file); keys starting `_` are notes, not nodes. */
export async function loadWorkflow(file: URL): Promise<Workflow> {
  const raw = JSON.parse(await Deno.readTextFile(file))
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !key.startsWith('_'))) as Workflow
}

/**
 * Fills a workflow's `$name` inputs: an input that is exactly `$name` becomes `values[name]`, keeping
 * its type (a number stays a number). One with no value is an error, so a typo never reaches
 * ComfyUI.
 */
export function fillWorkflow(workflow: Workflow, values: Record<string, unknown>): Workflow {
  const fill = (value: unknown): unknown => {
    if (typeof value !== 'string' || !value.startsWith('$')) return value
    const name = value.slice(1)
    if (!(name in values)) throw new Error(`The workflow wants $${name}, which nothing fills in`)
    return values[name]
  }
  return Object.fromEntries(
    Object.entries(workflow).map(([id, node]) => [
      id,
      {
        ...node,
        inputs: Object.fromEntries(Object.entries(node.inputs).map(([k, v]) => [k, fill(v)])),
      },
    ]),
  )
}

/**
 * Queues a filled workflow and follows it over the WebSocket to its end. Cancel interrupts just
 * this prompt; afterwards its prompt leaves ComfyUI's history, and ComfyUI unloads its models. If
 * ComfyUI stops answering meanwhile (`watchAlive`), the job fails rather than waiting for good.
 */
export async function runWorkflow(
  base: string,
  workflow: Workflow,
  signal: AbortSignal,
  checkEveryMs: number,
  onProgress?: (step: number, total: number) => void,
): Promise<WorkflowResult> {
  const clientId = crypto.randomUUID()
  const socket = await openSocket(base, clientId, signal)
  const before = await freeVram(base)
  let promptId: string | undefined
  let answering = true
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
      (answering = false) || stalled.abort(
        new Error('ComfyUI stopped answering (it may have crashed): restart it, then try again'),
      ))
    try {
      return await finished(socket, promptId, AbortSignal.any([signal, stalled.signal]), onProgress)
    } finally {
      clearInterval(watchdog)
      signal.removeEventListener('abort', cancel)
    }
  } finally {
    // Awaited, so the next job (the Text Model, say) starts once ComfyUI has let go of the GPU;
    // but not after a Cancel, which returns at once, or once ComfyUI stopped answering.
    const cleaned = cleanUp(base, socket, promptId, before)
    if (!signal.aborted && answering) await cleaned
  }
}

/** What ComfyUI says is free on its GPU, in bytes; undefined if it doesn't say. */
async function freeVram(base: string): Promise<number | undefined> {
  const stats = await fetch(`${base}/system_stats`, { signal: AbortSignal.timeout(5000) })
    .then((r) => r.json(), () => undefined)
  const free = stats?.devices?.[0]?.vram_free
  return typeof free === 'number' ? free : undefined
}

/**
 * Waits (up to `ms`) until ComfyUI's GPU is about as free as it was before the job (`before`):
 * `/free` takes a few seconds to act, longer for a model in a process of its own (TTS Audio Suite's
 * Qwen3-TTS). A Text Model loaded meanwhile on a 12 GB card would find too little free and run
 * partly on the CPU (seen once with a render, 2026-10-07: 80 s for an Opening Frame's text).
 */
async function released(base: string, before: number, ms: number) {
  const until = Date.now() + ms
  const slack = 512 * 1024 ** 2
  while (Date.now() < until) {
    const free = await freeVram(base)
    if (free === undefined || free >= before - slack) return
    await new Promise((r) => setTimeout(r, 500))
  }
}

/**
 * After a prompt: takes it out of ComfyUI's history, closes the WebSocket and unloads ComfyUI's
 * models. ComfyUI writes a prompt to its history only after it's done with it, after it has said
 * so (`execution_success`, `execution_error` or `execution_interrupted`), so this waits for that
 * first (up to 10 s), finished, failed or cancelled alike. Deleted any sooner it stayed there,
 * prompt text and all: after a Cancel (seen on Windows) and after a render that succeeded (seen on
 * the Mac, 2026-10-07), whenever the delete beat the write.
 */
async function cleanUp(
  base: string,
  socket: WebSocket,
  promptId: string | undefined,
  before: number | undefined,
) {
  if (promptId) await stopped(socket, promptId, 10_000)
  socket.close()
  if (promptId) post(base, '/history', { delete: [promptId] })
  await post(base, '/free', { unload_models: true, free_memory: true })
  if (before !== undefined) await released(base, before, 30_000)
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
 * it works), and calls `onDead` after two checks in a row get no answer: a ComfyUI that crashed
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
 * Sends a file to ComfyUI's temp folder under `name` (and `subfolder`), replacing any there, and
 * returns the name ComfyUI gave it. ComfyUI has no API to delete a file, so one that has been used
 * is overwritten with a stub this way; ComfyUI clears its temp folder when it next starts.
 */
export async function upload(
  base: string,
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
  subfolder = '',
): Promise<string> {
  const form = new FormData()
  form.append('image', new Blob([bytes]), name)
  form.append('type', 'temp')
  form.append('subfolder', subfolder)
  form.append('overwrite', 'true')
  const res = await fetch(`${base}/upload/image`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`ComfyUI didn't take the file: HTTP ${res.status}`)
  return (await res.json()).name
}

/** Fetches a file ComfyUI wrote (`/view`). */
export async function download(base: string, file: ComfyFile): Promise<Uint8Array> {
  const query = new URLSearchParams({ ...file })
  const res = await fetch(`${base}/view?${query}`, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`ComfyUI didn't send ${file.filename}: HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

export async function getJson(base: string, path: string, signal: AbortSignal) {
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
 * Resolves with what the workflow gave back when ComfyUI reports the prompt done; rejects with its
 * error, or the player's Cancel. Passes on the sampler's steps (`progress` events with a `max` above
 * 1). The picture is the last PNG image message: sampler previews, when ComfyUI sends them, come
 * before it and as JPEGs.
 */
function finished(
  socket: WebSocket,
  promptId: string,
  signal: AbortSignal,
  onProgress?: (step: number, total: number) => void,
): Promise<WorkflowResult> {
  const result: WorkflowResult = { outputs: {} }
  socket.binaryType = 'arraybuffer'
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    socket.onclose = () => reject(new Error('Lost the connection to ComfyUI mid-job'))
    socket.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        const header = new DataView(e.data)
        if (header.getUint32(0) === IMAGE_MESSAGE && header.getUint32(4) === PNG) {
          result.png = new Uint8Array(e.data, 8)
        }
        return
      }
      const { type, data } = JSON.parse(e.data) as { type: string; data?: Record<string, unknown> }
      if (data?.prompt_id !== promptId) return
      if (type === 'progress' && Number(data.max) > 1) {
        onProgress?.(Number(data.value), Number(data.max))
      } else if (type === 'executed' && data.output) {
        result.outputs[String(data.node)] = data.output as Record<string, unknown>
      } else if (type === 'execution_success') {
        resolve(result)
      } else if (type === 'execution_error') {
        reject(new Error(`ComfyUI: ${data.node_type ?? ''} ${data.exception_message ?? ''}`.trim()))
      } else if (type === 'execution_interrupted') {
        reject(signal.reason ?? new Error('ComfyUI was interrupted'))
      }
    }
  })
}
