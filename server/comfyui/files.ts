import { getJson, upload } from './client.ts'

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
