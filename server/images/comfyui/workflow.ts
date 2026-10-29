import { loadWorkflow, type Workflow } from '../../comfyui/client.ts'

/** Reads a model's workflow (`workflows/<id>.json`). */
export const loadModelWorkflow = (id: string): Promise<Workflow> =>
  loadWorkflow(new URL(`./workflows/${id}.json`, import.meta.url))
