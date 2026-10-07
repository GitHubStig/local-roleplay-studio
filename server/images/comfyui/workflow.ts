import type { ComfyModel } from './models.ts'

/** A workflow in ComfyUI's API format: node id → its class and inputs. */
export type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>

/** Reads a model's workflow (`workflows/<id>.json`); keys starting `_` are notes, not nodes. */
export async function loadWorkflow(id: string): Promise<Workflow> {
  const raw = JSON.parse(
    await Deno.readTextFile(new URL(`./workflows/${id}.json`, import.meta.url)),
  )
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
