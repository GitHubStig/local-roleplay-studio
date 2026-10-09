import type { ImageGenerator } from './imageGenerator.ts'
import type { ImageBackendKind } from './imageModels.ts'

/**
 * Renders with the backend a Session's Settings name (`imageBackend`): mflux, where it's installed,
 * or a ComfyUI server. Upscales (SeedVR2 on either) where Settings say now (`upscaleBackend`),
 * whichever backend rendered: a Mac can render with mflux and upscale on a faster ComfyUI machine.
 */
export function imageBackends(backends: {
  mflux?: ImageGenerator
  comfyui: ImageGenerator
  /** Settings' `upscaleBackend`, read when upscaling. */
  upscaleBackend: () => Promise<ImageBackendKind>
}): ImageGenerator {
  return {
    generate(req, signal, onProgress, onDownload, onPreview) {
      const backend = req.settings.imageBackend === 'comfyui' ? backends.comfyui : backends.mflux
      if (!backend) {
        return Promise.reject(
          new Error("mflux isn't installed here: choose ComfyUI as the Image backend in Settings"),
        )
      }
      return backend.generate(req, signal, onProgress, onDownload, onPreview)
    },
    async upscale(req, signal, onProgress, onDownload) {
      const backend = (await backends.upscaleBackend()) === 'comfyui'
        ? backends.comfyui
        : backends.mflux
      if (!backend) {
        throw new Error("mflux isn't installed here: choose ComfyUI for Upscale in Settings")
      }
      return backend.upscale(req, signal, onProgress, onDownload)
    },
  }
}
