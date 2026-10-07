import type { ImageGenerator } from './imageGenerator.ts'

/**
 * Renders with the backend a Session's Settings name (`imageBackend`): mflux, where it's installed,
 * or a ComfyUI server. Upscaling is SeedVR2 through mflux whichever renders, so it needs mflux.
 */
export function imageBackends(backends: {
  mflux?: ImageGenerator
  comfyui: ImageGenerator
}): ImageGenerator {
  return {
    generate(req, signal, onProgress, onDownload) {
      const backend = req.settings.imageBackend === 'comfyui' ? backends.comfyui : backends.mflux
      if (!backend) {
        return Promise.reject(
          new Error("mflux isn't installed here: choose ComfyUI as the Image backend in Settings"),
        )
      }
      return backend.generate(req, signal, onProgress, onDownload)
    },
    upscale(req, signal, onProgress, onDownload) {
      if (!backends.mflux) {
        return Promise.reject(new Error("Upscaling needs mflux, which isn't installed here"))
      }
      return backends.mflux.upscale(req, signal, onProgress, onDownload)
    },
  }
}
