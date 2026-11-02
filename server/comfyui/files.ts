import { type ComfyFile, getJson, post, upload } from './client.ts'
import type { ComfyTraces } from './traces.ts'

/**
 * The files a workflow's loaders can use: for each loader placeholder (`$unet`, `$clip`, `$vae`),
 * its model folder and file patterns, best first. Each machine has its own build of a model (int8
 * on the owner's Mac; fp8 suits an NVIDIA card), so the first one ComfyUI has installed is used.
 */
export interface ModelFiles {
  label: string
  files: Record<string, { folder: string; patterns: RegExp[] }>
}

/**
 * The file each of a model's loaders uses: for each, the first pattern that matches a file ComfyUI
 * has in that folder (`installed`). Names what's missing if one has none, so the player knows what
 * to download.
 */
export function pickFiles(
  model: ModelFiles,
  installed: (folder: string) => readonly string[],
): Record<string, string> {
  const picked: Record<string, string> = {}
  const missing: string[] = []
  for (const [slot, { folder, patterns }] of Object.entries(model.files)) {
    const files = installed(folder)
    const file = patterns.map((p) => files.find((f) => p.test(f))).find(Boolean)
    if (file) picked[slot] = file
    else missing.push(`${folder}/ (${patterns.map((p) => p.source).join(' or ')})`)
  }
  if (missing.length) {
    throw new Error(`ComfyUI doesn't have ${model.label}'s files: ${missing.join('; ')}`)
  }
  return picked
}

/** The files a model's loaders use on this ComfyUI (`pickFiles`); throws naming any missing. */
export async function modelFiles(base: string, model: ModelFiles, signal: AbortSignal) {
  const installed = new Map<string, string[]>()
  for (const folder of new Set(Object.values(model.files).map((f) => f.folder))) {
    installed.set(folder, await getJson(base, `/models/${folder}`, signal))
  }
  return pickFiles(model, (folder) => installed.get(folder) ?? [])
}

/**
 * Uploads pictures for one workflow, as ComfyUI needs them as files: they go to its temp folder,
 * and afterwards a blank 1×1 picture is written over each, so ComfyUI keeps an empty stub, which it
 * clears from temp when it next starts (it has no API to delete an upload). A blank that fails is
 * let go, so what's reported is how the job went.
 */
export async function withUploads<T>(
  base: string,
  pictures: Uint8Array<ArrayBuffer>[],
  use: (names: string[]) => Promise<T>,
): Promise<T> {
  const names: string[] = []
  try {
    for (const bytes of pictures) {
      names.push(await upload(base, `rpg-${crypto.randomUUID()}.png`, bytes))
    }
    return await use(names)
  } finally {
    await Promise.all(names.map((name) => upload(base, name, BLANK_PNG).catch(() => {})))
  }
}

/** A 1×1 transparent PNG, written over an uploaded picture once it's been used. */
const BLANK_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

/**
 * Cleans up what a job cut off by a server restart left on ComfyUI (`ComfyTraces`), as the job
 * would have as it ended: each prompt taken out of the queue or stopped, its outputs blanked once
 * ComfyUI has written them (read from its history, up to `waitMs`), and its history deleted; each
 * upload blanked. ComfyUI has no API to delete a file, so a stub stays, as after any job. Throws
 * if a ComfyUI can't be reached.
 */
export async function clearTraces(traces: ComfyTraces, waitMs = 30_000, everyMs = 1000) {
  for (const { base, promptId } of traces.prompts) {
    await getJson(base, '/queue', AbortSignal.timeout(15_000))
    await post(base, '/queue', { delete: [promptId] })
    await post(base, '/interrupt', { prompt_id: promptId })
    for (const file of await outputsOf(base, promptId, waitMs, everyMs)) await blank(base, file)
    await post(base, '/history', { delete: [promptId] })
  }
  for (const { base, file } of traces.uploads) await blank(base, file)
}

/** A prompt as ComfyUI's history keeps it once it has finished: how it went, and its outputs. */
export interface PromptHistory {
  status?: { status_str?: string }
  outputs?: Record<string, Record<string, unknown>>
}

/**
 * A prompt's history once ComfyUI has finished it, waiting while it's queued or running (until
 * `signal` aborts, or `waitMs` pass); none if it never ran, or ran before ComfyUI itself
 * restarted. A prompt just stopped is written to the history a moment after it leaves the queue,
 * so that's waited for a few checks.
 */
export async function historyOf(
  base: string,
  promptId: string,
  { signal = AbortSignal.timeout(15 * 60_000), waitMs = Infinity, everyMs = 1000 } = {},
): Promise<PromptHistory | undefined> {
  const until = Date.now() + waitMs
  let gone = 0
  while (Date.now() < until) {
    const asked = AbortSignal.any([signal, AbortSignal.timeout(15_000)])
    const history = await getJson(base, `/history/${promptId}`, asked)
    if (history?.[promptId]) return history[promptId] as PromptHistory
    const queue = await getJson(base, '/queue', asked)
    const queued = [...queue.queue_running ?? [], ...queue.queue_pending ?? []]
      .some((item: unknown[]) => item[1] === promptId)
    gone = queued ? 0 : gone + 1
    if (gone > 3) return undefined
    await new Promise<void>((resolve, reject) => {
      const stop = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', stop)
        resolve()
      }, everyMs)
      signal.addEventListener('abort', stop, { once: true })
    })
  }
  return undefined
}

/** The files a prompt wrote, from its history (`historyOf`, up to `waitMs`). */
async function outputsOf(base: string, promptId: string, waitMs: number, everyMs: number) {
  return filesOf((await historyOf(base, promptId, { waitMs, everyMs }))?.outputs ?? {})
}

/** The files ComfyUI's output nodes list, in its temp or output folder. */
const filesOf = (outputs: Record<string, Record<string, unknown>>): ComfyFile[] =>
  Object.values(outputs).flatMap((node) =>
    Object.values(node).flatMap((list) =>
      Array.isArray(list)
        ? list.filter((f): f is ComfyFile =>
          typeof f?.filename === 'string' && (f.type === 'output' || f.type === 'temp')
        )
        : []
    )
  )

/** Writes a stub over a file ComfyUI keeps: a blank picture over a PNG, else nothing. */
const blank = (base: string, file: ComfyFile) =>
  upload(
    base,
    file.filename,
    file.filename.endsWith('.png') ? BLANK_PNG : new Uint8Array(),
    file.subfolder,
    file.type === 'output' ? 'output' : 'temp',
  )
