import { join } from '@std/path'
import type { ImageGenerator } from '../imageGenerator.ts'
import { COMFYUI_URL } from '../imageModels.ts'
import { SIZE_PRESETS } from '../../settings.ts'
import { findComfyModel } from './models.ts'
import { fillWorkflow, loadWorkflow, pickFiles } from './workflow.ts'

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
export function comfyuiImageGenerator(): ImageGenerator {
  return {
    async generate(req, signal, onProgress) {
      const base = (req.settings.imageBaseUrl || COMFYUI_URL).replace(/\/+$/, '')
      const model = findComfyModel(req.settings.imageModel)
      if (!model) throw new Error(`ComfyUI has no Image Model "${req.settings.imageModel}" here`)
      const size = SIZE_PRESETS.find((p) => p.id === req.settings.size) ?? SIZE_PRESETS[0]

      const installed = new Map<string, string[]>()
      for (const folder of new Set(Object.values(model.files).map((f) => f.folder))) {
        installed.set(folder, await getJson(base, `/models/${folder}`, signal))
      }
      const workflow = fillWorkflow(await loadWorkflow(model.id), {
        ...pickFiles(model, (folder) => installed.get(folder) ?? []),
        prompt: req.prompt,
        seed: req.seed,
        steps: req.settings.steps,
        width: size.width,
        height: size.height,
      })

      const clientId = crypto.randomUUID()
      const socket = await openSocket(base, clientId, signal)
      try {
        const queued = await fetch(`${base}/prompt`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: workflow, client_id: clientId }),
          signal,
        })
        const body = await queued.json().catch(() => ({}))
        if (!queued.ok) throw new Error(`ComfyUI refused the workflow: ${refusal(body)}`)
        const promptId: string = body.prompt_id
        const cancel = () => {
          // Running: interrupt just this prompt. Still queued: take it out of the queue.
          post(base, '/interrupt', { prompt_id: promptId })
          post(base, '/queue', { delete: [promptId] })
        }
        signal.addEventListener('abort', cancel, { once: true })
        let png: Uint8Array
        try {
          png = await finished(socket, promptId, signal, onProgress)
        } finally {
          signal.removeEventListener('abort', cancel)
          post(base, '/history', { delete: [promptId] })
        }
        const file = `${req.name}.png`
        await Deno.writeFile(join(req.dir, file), png)
        return file
      } finally {
        socket.close()
        post(base, '/free', { unload_models: true, free_memory: true })
      }
    },

    upscale() {
      return Promise.reject(new Error("Upscaling isn't available through ComfyUI yet"))
    },
  }
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

const post = (base: string, path: string, body: object) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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
    socket.onopen = () => {
      socket.onerror = null
      resolve(socket)
    }
    socket.onerror = fail
    signal.addEventListener('abort', () => {
      socket.close()
      reject(signal.reason)
    }, { once: true })
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
