import { AsyncLocalStorage } from 'node:async_hooks'
import type { ComfyFile } from './client.ts'

/**
 * What a piece of work has left on a ComfyUI that it would clean up itself as it ends: the prompts
 * it queued (in its history, and their outputs) and the files it uploaded. Kept with a job while it
 * runs (`Job.comfy`), so a job cut off by a server restart can be cleaned up after
 * (`clearTraces`, `files.ts`).
 */
export interface ComfyTraces {
  prompts: { base: string; promptId: string }[]
  uploads: { base: string; file: ComfyFile }[]
}

/** One trace, as it's left. */
export type ComfyTrace =
  | { prompt: { base: string; promptId: string } }
  | { upload: { base: string; file: ComfyFile } }

const noting = new AsyncLocalStorage<(trace: ComfyTrace) => void>()

/** Runs `work`, telling `note` of each trace it leaves on a ComfyUI. */
export function notingTraces<T>(note: (trace: ComfyTrace) => void, work: () => Promise<T>) {
  return noting.run(note, work)
}

/** Tells the work running, if it's noting them, of a trace it has left. */
export const leftTrace = (trace: ComfyTrace) => noting.getStore()?.(trace)

/** `traces` with `trace` added, once. */
export function withTrace(traces: ComfyTraces | undefined, trace: ComfyTrace): ComfyTraces {
  const t = traces ?? { prompts: [], uploads: [] }
  if ('prompt' in trace) {
    const { base, promptId } = trace.prompt
    return t.prompts.some((p) => p.base === base && p.promptId === promptId)
      ? t
      : { ...t, prompts: [...t.prompts, trace.prompt] }
  }
  const { base, file } = trace.upload
  const same = (u: ComfyTraces['uploads'][number]) =>
    u.base === base && u.file.filename === file.filename && u.file.subfolder === file.subfolder &&
    u.file.type === file.type
  return t.uploads.some(same) ? t : { ...t, uploads: [...t.uploads, trace.upload] }
}
