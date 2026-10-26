import type { Backend } from '../backends.ts'
import { editJob, type HeavyJob } from '../machine.ts'
import type { ImageGenerator } from './imageGenerator.ts'

/**
 * Sends each job to the Backend Settings send it to now (`backendOf`, ADR 0022): a render by the
 * Session's Image Model, an upscale (SeedVR2 on either, whichever rendered: a Mac can render with
 * mflux and upscale on a faster ComfyUI machine), an edit by its edit model. This machine's runs
 * on mflux, where it's installed; a ComfyUI, at its address.
 */
export function imageBackends(backends: {
  mflux?: ImageGenerator
  /** A ComfyUI at `address` ('' for its usual one here). */
  comfyui: (address: string) => ImageGenerator
  /** The Backend `job` goes to now; none when no Backend can run it. */
  backendOf: (job: HeavyJob) => Promise<Backend | undefined>
}): ImageGenerator {
  const on = async (job: HeavyJob, what: string): Promise<ImageGenerator> => {
    const backend = await backends.backendOf(job)
    if (backend?.kind === 'comfyui') return backends.comfyui(backend.address)
    if (backend?.kind === 'here' && backends.mflux) return backends.mflux
    throw new Error(`No Backend can ${what}: add one in Settings, on the Machines tab`)
  }
  return {
    async generate(req, signal, onProgress, onDownload, onPreview) {
      const job: HeavyJob = { kind: 'render', settings: req.settings }
      return (await on(job, `render ${req.settings.imageModel}`))
        .generate(req, signal, onProgress, onDownload, onPreview)
    },
    async upscale(req, signal, onProgress, onDownload) {
      return (await on({ kind: 'upscale' }, 'upscale'))
        .upscale(req, signal, onProgress, onDownload)
    },
    async edit(req, signal, onProgress, onDownload) {
      return (await on(editJob(req.model), `edit with ${req.model}`))
        .edit(req, signal, onProgress, onDownload)
    },
  }
}
