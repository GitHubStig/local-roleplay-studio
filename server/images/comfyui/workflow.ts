import { loadWorkflow, type Workflow } from '../../comfyui/client.ts'
import type { ComfyModel } from './models.ts'

/** Reads a model's workflow (`workflows/<id>.json`). */
export const loadModelWorkflow = (id: string): Promise<Workflow> =>
  loadWorkflow(new URL(`./workflows/${id}.json`, import.meta.url))

/**
 * The file each of a model's loaders uses: for each, the first pattern that matches a file ComfyUI
 * has in that folder (`installed`). Names what's missing if one has none, so the player knows what
 * to download.
 */
export function pickFiles(
  model: Pick<ComfyModel, 'label' | 'files'>,
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
